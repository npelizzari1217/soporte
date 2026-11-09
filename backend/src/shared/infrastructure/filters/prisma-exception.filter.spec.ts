/**
 * prisma-exception.filter.spec.ts — unit de `PrismaExceptionFilter`
 * (sdd/filtro-prisma).
 *
 * Prueba la TABLA cerrada de códigos → (status, mensaje constante), el guard
 * estructural que reconoce un `PrismaClientKnownRequestError` de CUALQUIER
 * cliente Prisma generado (R5), y el default de fail-open para lo no
 * mapeado (R4). Es la única capa que cubre `P2002`/`P2003`: hoy no son
 * alcanzables por HTTP (ADR-7 — el dominio los pre-chequea).
 */
import { ArgumentsHost, HttpStatus } from '@nestjs/common';
import { AbstractHttpAdapter, BaseExceptionFilter, HttpAdapterHost } from '@nestjs/core';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import {
  esErrorPrismaConocido,
  MENSAJE_SERVICIO_SATURADO,
  PrismaExceptionFilter,
} from './prisma-exception.filter';
import { ILogger } from '../../domain/ports/i-logger.port';

describe('esErrorPrismaConocido — guard estructural (R5)', () => {
  it.each([
    {
      descripcion: 'objeto con name/code/message string',
      valor: { name: 'PrismaClientKnownRequestError', code: 'P2002', message: 'x' },
      esperado: true,
    },
    { descripcion: 'Error pelado', valor: new Error('boom'), esperado: false },
    {
      descripcion: 'objeto con code pero otro name',
      valor: { name: 'OtroError', code: 'P2002', message: 'x' },
      esperado: false,
    },
    { descripcion: 'null', valor: null, esperado: false },
    { descripcion: 'string', valor: 'PrismaClientKnownRequestError', esperado: false },
  ])('$descripcion → $esperado', ({ valor, esperado }) => {
    expect(esErrorPrismaConocido(valor)).toBe(esperado);
  });
});

/**
 * Fabrica un error con la forma que reconoce `esErrorPrismaConocido`.
 *
 * El `meta` NO es decorativo: un error real de Prisma lo trae, y adentro viaja
 * el mensaje crudo de Postgres con el nombre de la constraint y el valor
 * enviado. Los asserts de no-fuga tienen que correr sobre un fixture que SÍ
 * contiene lo que no debe aparecer — sobre un objeto sin `meta` no podrían
 * fallar nunca, que es el verde falso que este repo ya documenta.
 */
/**
 * Forma REAL del `message` de un `PrismaClientKnownRequestError`: no es una
 * línea, son varias, y traen la ruta absoluta del archivo del servidor más un
 * extracto del código fuente. Copiado de la salida real del e2e.
 *
 * La causa va en la ÚLTIMA línea; arriba está el encabezado de la invocación.
 */
const MENSAJE_MULTILINEA_REAL = [
  '',
  'Invalid `this.prisma.cliente.create()` invocation in',
  'C:/trabajos/soporte/backend/src/clientes/algun-archivo.ts:146:51',
  '  144 @Get()',
  '→ 146   await this.prisma.cliente.create(',
  'Unique constraint failed on the fields: (`cuit`)',
].join('\n');

function crearErrorPrisma(code: string, message = MENSAJE_MULTILINEA_REAL): Error {
  const error = new Error(message);
  error.name = 'PrismaClientKnownRequestError';
  return Object.assign(error, {
    code,
    meta: {
      target: ['cuit'],
      driverAdapterError: {
        originalMessage:
          'duplicate key value violates unique constraint "clientes_cuit_key" DETALLE: Key (cuit)=(20-12345678-9) already exists.',
      },
    },
  });
}

/**
 * Mock mínimo del `HttpAdapterHost` que `BaseExceptionFilter.catch()` usa de
 * verdad: `applicationRef.isHeadersSent(response)` + `applicationRef.reply(
 * response, body, status)` — NO `switchToHttp().getResponse()` (eso lo usa
 * el CÓDIGO PROPIO del filtro para leer method/path, no `super.catch()`).
 */
function crearAdapterHostMock(replySpy: ReturnType<typeof vi.fn>): HttpAdapterHost {
  const httpAdapter: AbstractHttpAdapter = Object.create(AbstractHttpAdapter.prototype, {
    isHeadersSent: { value: () => false },
    reply: { value: replySpy },
  });
  const host = new HttpAdapterHost();
  host.httpAdapter = httpAdapter;
  return host;
}

/** `ArgumentsHost` real sobre `[request, response]`: `getArgByIndex(1)` (usa `super.catch()`) + `switchToHttp()` (usa el filtro). */
function crearHostMock(request: { method: string; url: string }, response: object): ArgumentsHost {
  return new ExecutionContextHost([request, response]);
}

describe('PrismaExceptionFilter — catch()', () => {
  let filter: PrismaExceptionFilter;
  let logger: ILogger;
  const monitor = { registrar: vi.fn() };
  let host: ArgumentsHost;
  let replySpy: ReturnType<typeof vi.fn>;
  const response = {};
  const request = { method: 'POST', url: '/sectores' };

  beforeEach(() => {
    monitor.registrar.mockClear();
    replySpy = vi.fn();
    logger = { log: vi.fn(), error: vi.fn() };
    filter = new PrismaExceptionFilter(crearAdapterHostMock(replySpy), logger, monitor);
    host = crearHostMock(request, response);
  });

  it.each([
    {
      code: 'P2000',
      status: HttpStatus.BAD_REQUEST,
      mensaje: 'Uno de los valores enviados excede el largo máximo permitido.',
    },
    {
      code: 'P2020',
      status: HttpStatus.BAD_REQUEST,
      mensaje: 'Uno de los valores numéricos enviados está fuera del rango permitido.',
    },
    {
      code: 'P2002',
      status: HttpStatus.CONFLICT,
      mensaje: 'Ya existe un registro con esos datos.',
    },
    {
      code: 'P2003',
      status: HttpStatus.CONFLICT,
      mensaje: 'La operación afecta datos relacionados y no se puede completar.',
    },
  ])('$code → status $status con mensaje constante (R1, R2, R3)', ({ code, status, mensaje }) => {
    filter.catch(crearErrorPrisma(code), host);

    expect(replySpy).toHaveBeenCalledTimes(1);
    const [respuestaRecibida, body, statusRecibido] = replySpy.mock.calls[0] as [
      object,
      Record<string, unknown>,
      number,
    ];
    expect(respuestaRecibida).toBe(response);
    expect(statusRecibido).toBe(status);
    expect(body.message).toBe(mensaje);
  });

  it.each([
    {
      descripcion: 'P2025 (excluido del set — decisión ADR-1)',
      exception: crearErrorPrisma('P2025'),
    },
    { descripcion: 'Error pelado, no-Prisma', exception: new Error('boom inesperado') },
  ])(
    '$descripcion se delega INTACTO a super.catch() (misma excepción, sin HttpException nueva) y NO loguea (R4, R7 — hermano invertido)',
    ({ exception }) => {
      const superCatchSpy = vi
        .spyOn(BaseExceptionFilter.prototype, 'catch')
        .mockImplementation(() => undefined);

      filter.catch(exception, host);

      expect(superCatchSpy).toHaveBeenCalledTimes(1);
      expect(superCatchSpy).toHaveBeenCalledWith(exception, host);
      expect(logger.error).not.toHaveBeenCalled();

      superCatchSpy.mockRestore();
    },
  );

  it('loguea UNA vez con code/status/method/path/error, y el string NO contiene meta/driverAdapterError/originalMessage (R6)', () => {
    // Sin argumento: usa el mensaje multilínea REAL, con ruta y fuente adentro.
    const exception = crearErrorPrisma('P2002');

    filter.catch(exception, host);

    expect(logger.error).toHaveBeenCalledTimes(1);
    const [mensajeLogueado] = (logger.error as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    expect(mensajeLogueado).toBe(
      'PRISMA_ERROR_MAPEADO | code=P2002 | status=409 | method=POST | path=/sectores | ' +
        'error=Unique constraint failed on the fields: (`cuit`)',
    );
    // El fixture ES multilínea y trae ruta absoluta y extracto de fuente, como
    // el mensaje real de Prisma. Sin eso, estos asserts pasaban por ausencia.
    expect(mensajeLogueado.split('\n')).toHaveLength(1);
    expect(mensajeLogueado).not.toContain('C:/trabajos');
    expect(mensajeLogueado).not.toContain('invocation in');
    expect(mensajeLogueado).not.toContain('meta');
    expect(mensajeLogueado).not.toContain('driverAdapterError');
    expect(mensajeLogueado).not.toContain('originalMessage');
  });
});

describe('PrismaExceptionFilter — saturación de conexiones (odd/saturacion-conexiones, S2)', () => {
  let filter: PrismaExceptionFilter;
  let logger: ILogger;
  const monitor = { registrar: vi.fn() };
  let host: ArgumentsHost;
  let replySpy: ReturnType<typeof vi.fn>;
  const request = { method: 'GET', url: '/tickets?pagina=1' };

  beforeEach(() => {
    monitor.registrar.mockClear();
    replySpy = vi.fn();
    logger = { log: vi.fn(), error: vi.fn() };
    filter = new PrismaExceptionFilter(crearAdapterHostMock(replySpy), logger, monitor);
    host = crearHostMock(request, {});
  });

  // Las tres formas medidas contra Postgres real (L5 del documento).
  it.each([
    {
      origen: 'servidor',
      exception: crearErrorPrisma('P2037', 'Too many database connections opened'),
    },
    { origen: 'pool', exception: new Error('timeout exceeded when trying to connect') },
    {
      origen: 'transaccion',
      exception: crearErrorPrisma(
        'P2028',
        'Transaction API error: Unable to start a transaction in the given time.',
      ),
    },
  ])(
    '$origen → 503 con código SERVICIO_SATURADO y el mensaje para el usuario',
    ({ origen, exception }) => {
      filter.catch(exception, host);

      expect(replySpy).toHaveBeenCalledTimes(1);
      const [, body, status] = replySpy.mock.calls[0] as [object, Record<string, unknown>, number];
      expect(status).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      expect(body).toEqual({
        statusCode: 503,
        code: 'SERVICIO_SATURADO',
        message: MENSAJE_SERVICIO_SATURADO,
      });
      expect(logger.error).toHaveBeenCalledWith(
        `SATURACION_CONEXIONES | origen=${origen} | method=GET | path=/tickets?pagina=1`,
      );
      expect(monitor.registrar).toHaveBeenCalledWith(origen);
    },
  );

  it('un P2028 que no es falta de conexión sigue siendo un 500 sin mapear', () => {
    const superCatchSpy = vi
      .spyOn(BaseExceptionFilter.prototype, 'catch')
      .mockImplementation(() => undefined);
    const exception = crearErrorPrisma(
      'P2028',
      'Transaction already closed: the timeout for this transaction was 5000 ms.',
    );

    filter.catch(exception, host);

    expect(superCatchSpy).toHaveBeenCalledWith(exception, host);
    expect(logger.error).not.toHaveBeenCalled();
    expect(monitor.registrar).not.toHaveBeenCalled();
    superCatchSpy.mockRestore();
  });

  it('un Error común con otro mensaje sigue delegándose intacto', () => {
    const superCatchSpy = vi
      .spyOn(BaseExceptionFilter.prototype, 'catch')
      .mockImplementation(() => undefined);
    const exception = new Error('connection terminated unexpectedly');

    filter.catch(exception, host);

    expect(superCatchSpy).toHaveBeenCalledWith(exception, host);
    superCatchSpy.mockRestore();
  });
});
