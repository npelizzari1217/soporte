// Backfill (one-off, por tenant) de los tiempos hábiles que el dashboard promedia
// (odd/promedios-dashboard-habiles, T4). Completa lo que la migración
// 20261015140000_tiempos_habiles_tickets no pudo sacar del reloj de SLA:
//
// - `resolucion_habil_s` de los tickets en RESUELTO o CERRADO que siguen en NULL
//   (sin reloj incorporado, cohorte CORRIDO o con pliegue pendiente): segundos hábiles
//   desde `created_at` hasta el ÚLTIMO paso a RESUELTO del historial
//   (`operaciones_ticket`, tipo CAMBIO_ESTADO). NO `fecha_cierre`: esa columna se pisa
//   al pasar a CERRADO. Un ticket sin ese paso en el historial se saltea y se cuenta.
//   Estos valores no descuentan pausas: el historial previo al reloj no las tiene.
// - `primera_respuesta_habil_s` de los tickets con `primera_respuesta_at` y sin el
//   valor: segundos hábiles `created_at → primera_respuesta_at`.
//
// Calendario: el horario ACTUAL del tenant (`calendario_laboral_dias_cliente`) y los
// feriados master `feriados` + tenant `feriados_cliente`, igual que la app.
//
// Por defecto es un ENSAYO (dry run): informa cuántas filas tocaría y no escribe.
// Con `--apply` escribe. Idempotente POR CONSTRUCCIÓN: cada UPDATE re-evalúa
// `IS NULL` en la propia sentencia, así que un valor que el pliegue del reloj o la
// primera respuesta escribieron en el medio nunca se pisa, y correrlo dos veces no
// cambia nada. El de resolución re-evalúa además que el ticket siga en RESUELTO o
// CERRADO y que no tenga un paso a RESUELTO posterior al leído: uno reabierto (o
// reabierto y vuelto a resolver) entre la lectura y la escritura no recibe el valor.
//
// El cálculo hábil y los mappers viven en TypeScript; este script corre en el VPS
// después del build, así que se leen de `dist/` con `createRequire` (mismo criterio
// que `post-deploy-smoke-matriz-permisos.mjs`): una sola implementación del cálculo
// y del corrimiento de `@db.Date`, la desplegada.
//
// Uso (desde backend/, con backend/.env apuntando a la base real, después del build):
//   node scripts/backfill-tiempos-habiles.mjs            # ensayo
//   node scripts/backfill-tiempos-habiles.mjs --apply    # escribe
// Nunca imprime URLs ni credenciales: solo el nombre de cada base y sus conteos.
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const PREFIJO = '[backfill-tiempos-habiles]';

/** Filas por UPDATE: acota el tamaño de cada sentencia y de cada lock. */
export const LOTE = 500;

/**
 * `fecha` es `@db.Date`. El mapper espera lo que devuelve Prisma (medianoche UTC del
 * día calendario); `pg` crudo la daría a medianoche LOCAL del proceso. Se pide como
 * instante UTC para que `PrismaCalendarioLaboralMapper` aplique su regla sin cambios.
 */
const SELECT_FECHA = `("fecha"::timestamp AT TIME ZONE 'UTC') AS fecha`;

/** Lee los argumentos de la línea de comandos. Un argumento desconocido aborta. */
export function parsearArgs(argv) {
  const desconocidos = argv.filter((a) => a !== '--apply');
  if (desconocidos.length > 0) {
    throw new Error(`argumento desconocido: ${desconocidos.join(' ')} (uso: [--apply])`);
  }
  return { aplicar: argv.includes('--apply') };
}

/** Feriados globales de master, con la forma que espera el mapper. */
export async function leerFeriadosGlobales(masterPool) {
  const { rows } = await masterPool.query(`SELECT ${SELECT_FECHA} FROM "feriados"`);
  return rows;
}

const segundos = (ms) => Math.round(ms / 1000);

/**
 * Condición extra del UPDATE de resolución: el ticket sigue en RESUELTO o CERRADO en el
 * momento de escribir (mismo criterio que la lectura, por `estados.codigo`), y no tiene un
 * paso a RESUELTO posterior al leído (`v.fin_id`): si se reabrió y se volvió a resolver en el
 * medio, el valor calculado mide una resolución vieja y lo toma la corrida siguiente. Se
 * compara por id y en SQL porque `pg` devuelve el timestamptz sin los microsegundos.
 */
const SIGUE_RESUELTO = `AND EXISTS (
            SELECT 1 FROM "estados" e
             WHERE e."id" = t."estado_id" AND e."codigo" IN ('RESUELTO', 'CERRADO'))
          AND NOT EXISTS (
            SELECT 1 FROM "operaciones_ticket" o
              JOIN "tipo_operacion" tp ON tp."id" = o."tipo_operacion_id"
              JOIN "estados" en ON en."id" = o."estado_nuevo_id"
             WHERE o."ticket_id" = t."id" AND o."deleted_at" IS NULL
               AND tp."codigo" = 'CAMBIO_ESTADO' AND en."codigo" = 'RESUELTO'
               AND o."created_at" > (SELECT f."created_at" FROM "operaciones_ticket" f
                                      WHERE f."id" = v.fin_id))`;

/**
 * Escribe `columna` en lotes, solo donde sigue NULL (y, si se pasa, donde se cumple
 * `condicion`, que puede usar `v.fin_id`: la operación que se leyó como fin del tramo, o NULL).
 * Devuelve las filas escritas.
 */
async function escribirEnLotes(pool, columna, valores, condicion = '') {
  let escritos = 0;
  for (let i = 0; i < valores.length; i += LOTE) {
    const lote = valores.slice(i, i + LOTE);
    const r = await pool.query(
      `UPDATE "tickets" AS t
          SET "${columna}" = v.s
         FROM unnest($1::uuid[], $2::int[], $3::uuid[]) AS v(id, s, fin_id)
        WHERE t."id" = v.id AND t."${columna}" IS NULL ${condicion}`,
      [lote.map((x) => x.id), lote.map((x) => x.s), lote.map((x) => x.finId ?? null)],
    );
    escritos += r.rowCount ?? 0;
  }
  return escritos;
}

/**
 * Backfill de UN tenant. Recibe el pool y las dependencias por parámetro (en vez de
 * abrirlos acá) para que el test lo corra contra una base efímera con el código fuente.
 *
 * @param p.pool             pool del tenant.
 * @param p.feriadosGlobales filas de master `feriados` (ver `leerFeriadosGlobales`).
 * @param p.calculo          instancia de `CalcularSlaHabilVenceService`.
 * @param p.mapper           `PrismaCalendarioLaboralMapper`.
 * @param p.aplicar          `false` = ensayo, no escribe.
 * @returns conteos por columna: `aActualizar`, `actualizados` y, en resolución, `salteados`.
 */
export async function backfillTenant({ pool, feriadosGlobales, calculo, mapper, aplicar }) {
  const { rows: dias } = await pool.query(
    `SELECT "dia_semana" AS "diaSemana", "apertura_minuto" AS "aperturaMinuto",
            "cierre_minuto" AS "cierreMinuto"
       FROM "calendario_laboral_dias_cliente"`,
  );
  const calendario = mapper.toCalendarioSemanal(dias);
  const { rows: propios } = await pool.query(`SELECT ${SELECT_FECHA} FROM "feriados_cliente"`);
  const feriados = mapper.toFeriados([...feriadosGlobales, ...propios]);
  const habilS = (desde, hasta) =>
    segundos(calculo.msHabilesEntre(desde, hasta, calendario, feriados));

  const { rows: resueltos } = await pool.query(
    `SELECT t."id", t."created_at", ult.fin, ult.fin_id
       FROM "tickets" t
       JOIN "estados" e ON e."id" = t."estado_id"
       LEFT JOIN LATERAL (
         SELECT o."created_at" AS fin, o."id" AS fin_id
           FROM "operaciones_ticket" o
           JOIN "tipo_operacion" tp ON tp."id" = o."tipo_operacion_id"
           JOIN "estados" en ON en."id" = o."estado_nuevo_id"
          WHERE o."ticket_id" = t."id" AND o."deleted_at" IS NULL
            AND tp."codigo" = 'CAMBIO_ESTADO' AND en."codigo" = 'RESUELTO'
          ORDER BY o."created_at" DESC, o."id" DESC
          LIMIT 1
       ) ult ON true
      WHERE e."codigo" IN ('RESUELTO', 'CERRADO')
        AND t."resolucion_habil_s" IS NULL AND t."deleted_at" IS NULL
      ORDER BY t."id"`,
  );
  const resolucion = resueltos
    .filter((r) => r.fin !== null)
    .map((r) => ({ id: r.id, s: habilS(r.created_at, r.fin), finId: r.fin_id }));

  const { rows: respondidos } = await pool.query(
    `SELECT "id", "created_at", "primera_respuesta_at"
       FROM "tickets"
      WHERE "primera_respuesta_habil_s" IS NULL AND "primera_respuesta_at" IS NOT NULL
        AND "deleted_at" IS NULL
      ORDER BY "id"`,
  );
  const primeraRespuesta = respondidos.map((r) => ({
    id: r.id,
    s: habilS(r.created_at, r.primera_respuesta_at),
  }));

  return {
    resolucion: {
      aActualizar: resolucion.length,
      actualizados: aplicar
        ? await escribirEnLotes(pool, 'resolucion_habil_s', resolucion, SIGUE_RESUELTO)
        : 0,
      salteados: resueltos.length - resolucion.length,
    },
    primeraRespuesta: {
      aActualizar: primeraRespuesta.length,
      actualizados: aplicar
        ? await escribirEnLotes(pool, 'primera_respuesta_habil_s', primeraRespuesta)
        : 0,
    },
  };
}

/** Línea de salida de un tenant: solo el nombre de la base y los conteos. */
export function formatearResultado(dbName, r, aplicar) {
  const hecho = aplicar ? 'actualizados' : 'actualizaria';
  const n = (c) => (aplicar ? c.actualizados : c.aActualizar);
  return (
    `${PREFIJO} ${dbName}: resolucion ${hecho} ${n(r.resolucion)}, ` +
    `salteados ${r.resolucion.salteados} (sin paso a RESUELTO en el historial) | ` +
    `primera respuesta ${hecho} ${n(r.primeraRespuesta)}`
  );
}

// ── Entry point ──

/** Carga desde el build el cálculo, el mapper y el helper de sesión UTC. */
function cargarDist() {
  const require = createRequire(import.meta.url);
  try {
    return {
      ...require('../dist/calendario-laboral/domain/services/calcular-sla-habil-vence.service.js'),
      ...require('../dist/calendario-laboral/infrastructure/persistence/prisma/prisma-calendario-laboral.mapper.js'),
      ...require('../dist/shared/infrastructure/persistence/utc-connection-string.js'),
    };
  } catch (e) {
    console.error(`${PREFIJO} no se pudo leer dist/ — ¿corriste el build?\n         ${e.message}`);
    process.exit(1);
  }
}

async function main() {
  let aplicar;
  try {
    ({ aplicar } = parsearArgs(process.argv.slice(2)));
  } catch (e) {
    console.error(`${PREFIJO} ${e.message}`);
    process.exit(1);
  }
  const { CalcularSlaHabilVenceService, PrismaCalendarioLaboralMapper, conUtc } = cargarDist();

  try {
    process.loadEnvFile();
  } catch {
    // .env ausente: se usan las variables ya presentes en el entorno.
  }
  const masterUrl = process.env.DATABASE_URL_MASTER;
  if (!masterUrl) {
    console.error(`${PREFIJO} falta DATABASE_URL_MASTER`);
    process.exit(1);
  }
  /** URL del tenant = master con el pathname reemplazado por /db_name (como migrate-tenants.js). */
  const tenantUrl = (dbName) => {
    const u = new URL(masterUrl);
    u.pathname = '/' + dbName;
    return u.toString();
  };

  const master = conUtc(masterUrl, { connectionTimeoutMillis: 10000 });
  let dbNames;
  let feriadosGlobales;
  try {
    const { rows } = await master.query(
      'select db_name from clientes where activo = true and deleted_at is null order by db_name',
    );
    dbNames = rows.map((r) => r.db_name);
    feriadosGlobales = await leerFeriadosGlobales(master);
  } finally {
    await master.end();
  }

  console.log(
    `${PREFIJO} ${aplicar ? 'APLICANDO' : 'ENSAYO (sin --apply no escribe)'}; ` +
      `${dbNames.length} tenant(s) activo(s)`,
  );
  const calculo = new CalcularSlaHabilVenceService();
  let fallidos = 0;
  for (const dbName of dbNames) {
    const pool = conUtc(tenantUrl(dbName), { connectionTimeoutMillis: 10000 });
    try {
      const r = await backfillTenant({
        pool,
        feriadosGlobales,
        calculo,
        mapper: PrismaCalendarioLaboralMapper,
        aplicar,
      });
      console.log(formatearResultado(dbName, r, aplicar));
    } catch (e) {
      fallidos += 1;
      console.error(`${PREFIJO} ${dbName}: ERROR ${e.message}`);
    } finally {
      await pool.end();
    }
  }
  if (fallidos > 0) {
    console.error(`${PREFIJO} ${fallidos} tenant(s) con error`);
    process.exit(1);
  }
  console.log(`${PREFIJO} OK`);
}

// Solo corre si el archivo se invoca directamente: el test importa las funciones.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
