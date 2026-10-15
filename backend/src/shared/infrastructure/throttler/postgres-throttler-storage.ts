import { createHash } from 'node:crypto';
import { Provider } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { Prisma } from '.prisma/master';
import { ILogger, LOGGER } from '../../domain/ports/i-logger.port';
import { PrismaService } from '../persistence/prisma.service';

/** `ThrottlerStorageRecord` no se exporta desde el indice del paquete. */
type ThrottlerStorageRecord = Awaited<ReturnType<ThrottlerStorage['increment']>>;

const PURGA_CADA_MS = 60 * 60 * 1000;
/** Margen de la purga: mucho mayor que la ventana mas larga de los cuatro limitadores (1 h). */
const PURGA_MARGEN_MS = 24 * 60 * 60 * 1000;

/** Lo que devuelve `increment` cuando la base no responde: cuenta 0 y sin bloqueo (CA3). */
export const REGISTRO_SIN_LIMITE: ThrottlerStorageRecord = Object.freeze({
  totalHits: 0,
  timeToExpire: 0,
  isBlocked: false,
  timeToBlockExpire: 0,
});

interface FilaContador {
  hits: number;
  expira_ms: number;
  bloqueado: boolean;
  bloqueo_ms: number;
}

/** Instante en ms (reloj de la app) como `timestamptz`; el `to_timestamp` redondea a µs, exacto. */
const ts = (ms: number): Prisma.Sql => Prisma.sql`to_timestamp(${ms}::double precision / 1000)`;

/**
 * Estado siguiente de un contador a partir de `previo` (columnas `vencimientos, expira_en,
 * bloqueado, bloqueado_hasta`). Es el `increment` de `ThrottlerStorageService` 6.5.0 paso a paso:
 * 1. vencen los pedidos cuyo `vencimiento <= ahora` (los `setTimeout` de memoria);
 * 2. si la ventana vencio, `expira_en = ahora + ttl`;
 * 3. si no esta bloqueado, cuenta el pedido;
 * 4. si la cuenta pasa el limite, bloquea hasta `ahora + blockDuration`;
 * 5. si esta bloqueado y el bloqueo vencio, reinicia con un solo pedido.
 */
function siguienteEstado(
  previo: Prisma.Sql,
  ahora: number,
  ttl: number,
  limit: number,
  blockDuration: number,
): Prisma.Sql {
  const vencePedido = ts(ahora + ttl);
  return Prisma.sql`
    SELECT CASE WHEN r.reinicia THEN ARRAY[${vencePedido}] ELSE b.hits END AS vencimientos,
           a.expira_en,
           b.bloqueado AND NOT r.reinicia AS bloqueado,
           b.bloqueado_hasta
    FROM (${previo}) AS p(vencimientos, expira_en, bloqueado, bloqueado_hasta)
    CROSS JOIN LATERAL (
      SELECT CASE WHEN p.expira_en <= ${ts(ahora)} THEN ${vencePedido} ELSE p.expira_en END
               AS expira_en,
             CASE WHEN p.bloqueado THEN v.vivos ELSE v.vivos || ${vencePedido} END AS hits
      FROM (SELECT coalesce(array_agg(h ORDER BY h), '{}'::timestamptz[]) AS vivos
            FROM unnest(p.vencimientos) AS h WHERE h > ${ts(ahora)}) AS v
    ) AS a
    CROSS JOIN LATERAL (
      SELECT p.bloqueado OR cardinality(a.hits) > ${limit}::int AS bloqueado,
             CASE WHEN NOT p.bloqueado AND cardinality(a.hits) > ${limit}::int
                  THEN ${ts(ahora + blockDuration)} ELSE p.bloqueado_hasta END AS bloqueado_hasta,
             a.hits
    ) AS b
    CROSS JOIN LATERAL (
      SELECT b.bloqueado AND coalesce(b.bloqueado_hasta, to_timestamp(0)) <= ${ts(ahora)}
               AS reinicia
    ) AS r`;
}

/**
 * PostgresThrottlerStorage — `ThrottlerStorage` de `@nestjs/throttler` sobre la tabla master
 * `throttler_contadores`, compartido por todos los procesos del backend
 * (odd/tasks/throttler-postgres.md).
 *
 * Misma semantica que `ThrottlerStorageService` 6.5.0 (CA1): ventana deslizante por pedido (cada
 * pedido deja de contar `ttl` ms despues), `ttl`/`blockDuration` en ms, `timeToExpire` y
 * `timeToBlockExpire` en segundos con `Math.ceil`. Diferencias deliberadas: la cuenta es por
 * `throttlerName` + key (memoria comparte la ventana y el bloqueo entre nombres, caso que ningun
 * guard del repo produce), y no replica que en memoria un bloqueo vencido de una key cancele los
 * vencimientos pendientes de las demas keys del mismo throttler.
 *
 * Todo el `increment` es UN `INSERT ... ON CONFLICT DO UPDATE`: el lock de fila serializa los
 * pedidos concurrentes de cualquier proceso (CA2). El reloj es el de la app (inyectable), no el de
 * la base. Si la consulta falla, deja pasar y loguea sin la key en claro (CA3, decision del dueno).
 * Se construye con `THROTTLER_STORAGE_POSTGRES` (o a mano), no por `useClass`: el reloj no se inyecta.
 */
export class PostgresThrottlerStorage implements ThrottlerStorage {
  private ultimaPurga = 0;

  constructor(
    private readonly prismaService: PrismaService,
    private readonly logger: ILogger,
    private readonly ahora: () => number = Date.now,
  ) {}

  private get client() {
    return this.prismaService.getMasterClient();
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const ahora = this.ahora();
    await this.purgarSiCorresponde(ahora);
    const clave = `${throttlerName}:${key}`;
    const paso = (previo: Prisma.Sql) => siguienteEstado(previo, ahora, ttl, limit, blockDuration);
    try {
      const [fila] = await this.client.$queryRaw<FilaContador[]>`
        INSERT INTO throttler_contadores AS t (clave, vencimientos, expira_en, bloqueado, bloqueado_hasta)
        SELECT ${clave}, s.* FROM (${paso(
          Prisma.sql`SELECT '{}'::timestamptz[], to_timestamp(0), false, NULL::timestamptz`,
        )}) AS s
        ON CONFLICT (clave) DO UPDATE SET (vencimientos, expira_en, bloqueado, bloqueado_hasta) = (${paso(
          Prisma.sql`SELECT t.vencimientos, t.expira_en, t.bloqueado, t.bloqueado_hasta`,
        )})
        RETURNING cardinality(vencimientos)::int AS hits,
                  (extract(epoch FROM expira_en) * 1000)::float8 AS expira_ms,
                  bloqueado,
                  coalesce(extract(epoch FROM bloqueado_hasta) * 1000, 0)::float8 AS bloqueo_ms`;
      return {
        totalHits: fila.hits,
        timeToExpire: Math.ceil((Math.round(fila.expira_ms) - ahora) / 1000),
        isBlocked: fila.bloqueado,
        timeToBlockExpire: Math.ceil((Math.round(fila.bloqueo_ms) - ahora) / 1000),
      };
    } catch (error) {
      this.logger.error(
        `THROTTLER_ERROR | throttler=${throttlerName} | clave=${huella(clave)} | ` +
          `se deja pasar el pedido | error=${mensajeDe(error)}`,
      );
      return { ...REGISTRO_SIN_LIMITE };
    }
  }

  /** Como maximo una vez por hora por proceso; una purga fallida no frena el pedido (CA4). */
  private async purgarSiCorresponde(ahora: number): Promise<void> {
    if (ahora - this.ultimaPurga < PURGA_CADA_MS) return;
    this.ultimaPurga = ahora;
    const corte = ts(ahora - PURGA_MARGEN_MS);
    try {
      await this.client.$executeRaw`
        DELETE FROM throttler_contadores
        WHERE expira_en < ${corte} AND (bloqueado_hasta IS NULL OR bloqueado_hasta < ${corte})`;
    } catch (error) {
      this.ultimaPurga = 0;
      this.logger.error(`THROTTLER_ERROR | purga fallida | error=${mensajeDe(error)}`);
    }
  }
}

/** Prefijo corto de un sha256: identifica la key en el log sin exponerla. */
const huella = (clave: string): string =>
  createHash('sha256').update(clave).digest('hex').slice(0, 12);

const mensajeDe = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * Provider de `ThrottlerStorage` para los modulos que declaran el throttler local (API v1,
 * recuperacion de contrasena, formulario publico). `PrismaService` y `LOGGER` vienen de
 * `SharedModule` (`@Global()`).
 */
export const THROTTLER_STORAGE_POSTGRES: Provider = {
  provide: ThrottlerStorage,
  useFactory: (prismaService: PrismaService, logger: ILogger) =>
    new PostgresThrottlerStorage(prismaService, logger),
  inject: [PrismaService, LOGGER],
};
