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
import { BaseExceptionFilter, HttpAdapterHost } from '@nestjs/core';
import { esErrorPrismaConocido, PrismaExceptionFilter } from './prisma-exception.filter';
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
  const httpAdapter = {
    isHeadersSent: () => false,
    reply: replySpy,
  };
  return { httpAdapter } as unknown as HttpAdapterHost;
}

/** Mock mínimo de `ArgumentsHost`: `getArgByIndex(1)` (usa `super.catch()`) + `switchToHttp()` (usa el filtro). */
function crearHostMock(request: { method: string; url: string }, response: object): ArgumentsHost {
  return {
    getArgByIndex: (index: number) => [request, response][index],
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;
}

describe('PrismaExceptionFilter — catch()', () => {
  let filter: PrismaExceptionFilter;
  let logger: ILogger;
  let host: ArgumentsHost;
  let replySpy: ReturnType<typeof vi.fn>;
  const response = {};
  const request = { method: 'POST', url: '/sectores' };

  beforeEach(() => {
    replySpy = vi.fn();
    logger = { log: vi.fn(), error: vi.fn() };
    filter = new PrismaExceptionFilter(crearAdapterHostMock(replySpy), logger);
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
