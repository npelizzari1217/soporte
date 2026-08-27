/**
 * prisma-exception.filter.ts — backstop global de excepciones de Prisma
 * (sdd/filtro-prisma).
 *
 * Convierte un set CERRADO de errores del driver en 4xx con mensaje fijo.
 * Todo lo que no esté en ese set se delega intacto a `super.catch()` y sigue
 * siendo 500: un backstop que mapea de más convierte bugs del servidor en
 * 4xx y los vuelve invisibles.
 *
 * El reconocimiento es ESTRUCTURAL (`name` + `code`), nunca `instanceof`:
 * este repo genera DOS clientes Prisma independientes (`.prisma/master` y
 * `.prisma/tenant`), cada uno con su propia clase de error, así que un
 * `instanceof` contra uno no matchea los del otro — y 9 de los 10 agujeros
 * conocidos viven en módulos tenant.
 *
 * El mensaje al cliente es CONSTANTE por código y jamás se deriva de
 * `error.meta`: ese `meta` trae `driverAdapterError` con el mensaje crudo de
 * Postgres, que puede incluir el nombre de la columna y el valor enviado.
 *
 * Se registra como `APP_FILTER` en `SharedModule` y no en `AppModule`,
 * porque ningún spec e2e importa `AppModule` — ver `shared.module.ts`.
 *
 * Ref spec: sdd/filtro-prisma/spec.
 * Ref design: sdd/filtro-prisma/design (ADR-1 a ADR-8).
 */
import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ConflictException,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { BaseExceptionFilter, HttpAdapterHost } from '@nestjs/core';
import { ILogger, LOGGER } from '../../domain/ports/i-logger.port';

/** Forma mínima que el filtro necesita de un error conocido de Prisma. */
export interface ErrorPrismaConocido {
  readonly code: string;
  readonly message: string;
}

/**
 * Reconoce un `PrismaClientKnownRequestError` por FORMA, no por `instanceof`
 * (ADR-4): hay dos clientes Prisma generados e independientes
 * (`.prisma/master` y `.prisma/tenant`), cada uno con su propia clase de
 * error, y un `instanceof` contra una sola no cubre a la otra. El propio
 * runtime de Prisma se reconoce a sí mismo con el mismo criterio
 * estructural, no con `instanceof`.
 */
export function esErrorPrismaConocido(error: unknown): error is ErrorPrismaConocido {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    error.name === 'PrismaClientKnownRequestError' &&
    'code' in error &&
    typeof error.code === 'string' &&
    'message' in error &&
    typeof error.message === 'string'
  );
}

/**
 * Traducción cerrada código Prisma → respuesta HTTP. Ver ADR-1 y ADR-3.
 *
 * `status` está angostado a la unión de los dos únicos valores que
 * `crearHttpException` sabe traducir — no al `HttpStatus` completo. Con el
 * tipo ancho, agregar una entrada con un tercer status (ej.
 * `UNPROCESSABLE_ENTITY`) compila limpio y cae en el `default` de
 * `crearHttpException`, que responde 400: el log diría `status=422` y el
 * cliente recibiría 400, mintiéndose entre sí sin error ni warning. Con la
 * unión cerrada, esa misma entrada es un error de compilación.
 */
interface MapeoErrorPrisma {
  readonly status: HttpStatus.BAD_REQUEST | HttpStatus.CONFLICT;
  /** Mensaje CONSTANTE. Jamás derivado de `error.meta` ni de `error.message` (ADR-3). */
  readonly mensaje: string;
}

/**
 * Set CERRADO de códigos reconocidos (ADR-1). `P2025` queda deliberadamente
 * afuera — sigue en 500 (R4). Todo lo no listado también sigue en 500.
 */
const MAPEO_ERRORES_PRISMA: ReadonlyMap<string, MapeoErrorPrisma> = new Map([
  [
    'P2000',
    {
      status: HttpStatus.BAD_REQUEST,
      mensaje: 'Uno de los valores enviados excede el largo máximo permitido.',
    },
  ],
  [
    'P2020',
    {
      status: HttpStatus.BAD_REQUEST,
      mensaje: 'Uno de los valores numéricos enviados está fuera del rango permitido.',
    },
  ],
  ['P2002', { status: HttpStatus.CONFLICT, mensaje: 'Ya existe un registro con esos datos.' }],
  [
    'P2003',
    {
      status: HttpStatus.CONFLICT,
      mensaje: 'La operación afecta datos relacionados y no se puede completar.',
    },
  ],
]);

@Catch()
export class PrismaExceptionFilter extends BaseExceptionFilter {
  constructor(
    adapterHost: HttpAdapterHost,
    @Inject(LOGGER) private readonly logger: Pick<ILogger, 'error'>,
  ) {
    super(adapterHost.httpAdapter);
  }

  /**
   * Único punto de entrada del filtro — Nest lo invoca para CUALQUIER
   * excepción no capturada de la app (por eso `@Catch()` sin argumentos).
   *
   * @param exception Excepción cruda, de tipo desconocido: puede ser un
   *   `PrismaClientKnownRequestError` de cualquiera de los dos clientes
   *   generados (`.prisma/master` o `.prisma/tenant`, ver ADR-4), un
   *   `DomainError` ya resuelto que no debería llegar acá (ADR-7), o
   *   cualquier otro error de Node/Nest.
   * @param host Contexto de ejecución de Nest; se delega intacto a
   *   `super.catch()` en todos los casos, mapeada o no la excepción.
   * @returns No retorna nada: la respuesta se escribe por efecto de lado a
   *   través de `super.catch()` (así lo exige `BaseExceptionFilter`).
   */
  catch(exception: unknown, host: ArgumentsHost): void {
    if (!esErrorPrismaConocido(exception)) {
      super.catch(exception, host);
      return;
    }

    const mapeo = MAPEO_ERRORES_PRISMA.get(exception.code);
    if (!mapeo) {
      // Fail-open (R4): código de Prisma reconocido en FORMA pero fuera del
      // set cerrado (ej. P2025). Se delega intacto, sin loguear.
      super.catch(exception, host);
      return;
    }

    this.loguearInterceptado(exception, mapeo, host);
    super.catch(crearHttpException(mapeo), host);
  }

  /**
   * Log enmascarado de ADR-8: SOLO `code`, `status`, `method`, `path` y la
   * causa del error, normalizada a UNA línea. NUNCA `error.meta`: ahí viaja el
   * mensaje crudo de Postgres, con los valores enviados adentro (mismo criterio
   * que `PrismaTenantTransactionRunner.ejecutarProtegida` y
   * `PreventivoSweepScheduler`).
   *
   * Existe para que un `P2000` que llegue hasta acá se lea como un DTO que
   * falta — por eso el registro tiene que quedar grepeable por endpoint.
   */
  private loguearInterceptado(
    exception: ErrorPrismaConocido,
    mapeo: MapeoErrorPrisma,
    host: ArgumentsHost,
  ): void {
    const request = host.switchToHttp().getRequest<{ method: string; url: string }>();
    this.logger.error(
      `PRISMA_ERROR_MAPEADO | code=${exception.code} | status=${mapeo.status} | ` +
        `method=${request.method} | path=${request.url} | error=${causaEnUnaLinea(exception.message)}`,
    );
  }
}

/**
 * Reduce el mensaje de Prisma a su última línea no vacía.
 *
 * El `message` de un `PrismaClientKnownRequestError` real NO es una línea: son
 * quince, y traen la RUTA ABSOLUTA del archivo del servidor más un extracto del
 * código fuente. Interpolarlo crudo rompe el formato de una línea que este log
 * promete —un grep por `PRISMA_ERROR_MAPEADO` devolvería un fragmento sin
 * `code=` ni `path=`— y encima filtra rutas y fuente al destino del log.
 *
 * Se toma la ÚLTIMA línea y no la primera porque Prisma pone ahí la causa real
 * ("Foreign key constraint violated on the constraint: ..."); arriba va el
 * encabezado de la invocación.
 */
function causaEnUnaLinea(message: string): string {
  const lineas = message
    .split('\n')
    .map((linea) => linea.trim())
    .filter((linea) => linea.length > 0);
  // Índice explícito y no `.at(-1)`: el `lib` de este tsconfig es anterior a
  // ES2022 y `Array.prototype.at` no está declarado.
  return lineas.length > 0 ? lineas[lineas.length - 1] : message.trim();
}

/**
 * Traduce una entrada de la tabla cerrada a la `HttpException` de Nest
 * correspondiente. Sin `default` a propósito (ver JSDoc de `MapeoErrorPrisma`):
 * el `switch` es EXHAUSTIVO sobre la unión angosta de `status`, así que el
 * compilador exige una rama nueva —y por lo tanto que alguien la escriba a
 * mano— el día que se sume un tercer status a la tabla.
 */
function crearHttpException(mapeo: MapeoErrorPrisma): BadRequestException | ConflictException {
  switch (mapeo.status) {
    case HttpStatus.CONFLICT:
      return new ConflictException(mapeo.mensaje);
    case HttpStatus.BAD_REQUEST:
      return new BadRequestException(mapeo.mensaje);
  }
}
