// Limpieza (one-off) de los componentes de equipo sin repuesto vinculado
// (`componentes_equipo.insumo_id IS NULL`) en TODAS las bases de inquilino.
//
// Ref: sdd catalogo-unico-componentes, ADR-3 (WU-1). La migración tenant que
// vuelve `insumo_id` NOT NULL (WU-6) aborta si queda UNA sola fila con NULL,
// borradas lógicamente incluidas. Este script existe para que esas filas se
// inventaríen y se borren de forma explícita, con el número a la vista, antes
// de la ventana de migración. La migración nunca borra en silencio.
//
// Modos:
//   (sin flags)                    Reporte de solo lectura. Exit 0 sin filas, 2 con filas.
//   --apply --esperadas=N          Recuenta; si el total no es N, no borra nada.
//                                  Si coincide, borra por tenant en una transacción
//                                  y verifica que los ids borrados sean los inventariados.
//                                  Exit 0 ok, 1 error o desacuerdo.
//   --apply (sin --esperadas)      No hace nada y falla (exit 1).
//
// Recorre el mismo conjunto de tenants que `migrate-tenants.js` (clientes con
// `activo = true` y `deleted_at IS NULL`) y deriva la URL igual (pathname de
// `DATABASE_URL_MASTER` reemplazado por `/db_name`). Los clientes inactivos o
// borrados quedan FUERA del recorrido: el reporte los lista, pero ni este
// script ni la migración los tocan.
//
// ESM con `pg` directo y sin leer `dist/`: tiene que correr en el VPS antes
// del build (por eso no usa `conUtc`; las fechas se formatean en ISO/UTC).
import { pathToFileURL } from 'node:url';
import pg from 'pg';

export const EXIT_OK = 0;
export const EXIT_ERROR = 1;
export const EXIT_CON_FILAS = 2;

const LOG = '[limpiar-componentes]';

// ── Argumentos ──

/**
 * Parsea `argv` (sin `node` ni el script). Devuelve `{ apply, esperadas }` o
 * `{ error }` si los flags son inválidos. Nunca lanza.
 */
export function parsearArgs(argv) {
  let apply = false;
  let esperadas = null;

  for (const arg of argv) {
    if (arg === '--apply') {
      apply = true;
    } else if (arg.startsWith('--esperadas=')) {
      const valor = arg.slice('--esperadas='.length);
      if (!/^\d+$/.test(valor)) {
        return { error: `--esperadas debe ser un entero no negativo, se recibió "${valor}"` };
      }
      esperadas = Number(valor);
    } else {
      return { error: `argumento desconocido: ${arg}` };
    }
  }

  if (esperadas !== null && !apply) {
    return { error: '--esperadas solo tiene sentido junto con --apply' };
  }
  if (apply && esperadas === null) {
    return {
      error: '--apply exige --esperadas=N (el total que mostró el reporte); no se borró nada',
    };
  }

  return { apply, esperadas };
}

// ── Tenants ──

/** URL del tenant = master con el pathname reemplazado por /db_name (igual que migrate-tenants.js). */
export function tenantUrl(masterUrl, dbName) {
  const u = new URL(masterUrl);
  u.pathname = '/' + dbName;
  return u.toString();
}

/**
 * Lee de master los tenants del recorrido (mismo criterio que
 * `migrate-tenants.js`) y los clientes que quedan fuera de él.
 */
export async function leerClientes(masterPool) {
  const { rows: enRecorrido } = await masterPool.query(
    'select nombre, db_name from clientes where activo = true and deleted_at is null order by db_name',
  );
  const { rows: fuera } = await masterPool.query(
    `select nombre, db_name, activo, deleted_at from clientes
      where activo = false or deleted_at is not null order by db_name`,
  );
  return { enRecorrido, fuera };
}

// ── Inventario ──

function iso(fecha) {
  return fecha instanceof Date ? fecha.toISOString() : String(fecha);
}

/** Filas de `componentes_equipo` con `insumo_id NULL` (vivas y borradas lógicamente). */
export async function inventariarTenant(pool) {
  const { rows } = await pool.query(
    `select c.id, c.equipo_id, e.nombre as equipo, c.tipo_componente_codigo, c.deleted_at
       from componentes_equipo c
       left join equipos_informaticos e on e.id = c.equipo_id
      where c.insumo_id is null
      order by c.id`,
  );
  return rows.map((r) => ({
    id: r.id,
    equipo: r.equipo ?? `(equipo ${r.equipo_id})`,
    tipo: r.tipo_componente_codigo,
    borradaEn: r.deleted_at ? iso(r.deleted_at) : null,
  }));
}

/**
 * Inventaría cada tenant. `tenants` es una lista de `{ dbName, pool }`.
 * Devuelve `{ porTenant: [{ dbName, filas }], vivas, borradas, total }`.
 */
export async function inventariar(tenants) {
  const porTenant = [];
  let vivas = 0;
  let borradas = 0;
  for (const { dbName, pool } of tenants) {
    const filas = await inventariarTenant(pool);
    vivas += filas.filter((f) => f.borradaEn === null).length;
    borradas += filas.filter((f) => f.borradaEn !== null).length;
    porTenant.push({ dbName, filas });
  }
  return { porTenant, vivas, borradas, total: vivas + borradas };
}

/** Texto del reporte. `fuera` es la lista de clientes fuera del recorrido. */
export function formatearReporte(inventario, fuera) {
  const lineas = [];
  for (const { dbName, filas } of inventario.porTenant) {
    if (filas.length === 0) {
      lineas.push(`${LOG} ${dbName}: sin filas con insumo_id NULL`);
      continue;
    }
    lineas.push(`${LOG} ${dbName}: ${filas.length} fila(s) con insumo_id NULL`);
    for (const f of filas) {
      const estado = f.borradaEn ? `borrada lógicamente el ${f.borradaEn}` : 'viva';
      lineas.push(`${LOG}   - ${f.id} equipo="${f.equipo}" tipo=${f.tipo} (${estado})`);
    }
  }
  lineas.push(
    `${LOG} Total: ${inventario.total} (${inventario.vivas} vivas, ${inventario.borradas} borradas lógicamente)`,
  );

  if (fuera.length > 0) {
    lineas.push(
      `${LOG} Clientes FUERA del recorrido (inactivos o borrados; no se inspeccionan ni se tocan): ${fuera.length}`,
    );
    for (const c of fuera) {
      const motivo = c.deleted_at ? `borrado el ${iso(c.deleted_at)}` : 'inactivo';
      lineas.push(`${LOG}   - ${c.nombre} (${c.db_name}) ${motivo}`);
    }
  } else {
    lineas.push(`${LOG} Clientes fuera del recorrido (inactivos o borrados): ninguno`);
  }
  return lineas.join('\n');
}

// ── Apply ──

/**
 * Borra en UNA transacción las filas con `insumo_id NULL` de un tenant y
 * verifica que los ids devueltos por el DELETE sean exactamente los
 * inventariados. Si difieren, `ROLLBACK` y lanza.
 */
export async function borrarEnTenant(pool, idsInventariados) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'delete from componentes_equipo where insumo_id is null returning id',
    );
    const borrados = rows.map((r) => r.id).sort();
    const esperados = [...idsInventariados].sort();
    const coincide =
      borrados.length === esperados.length && borrados.every((id, i) => id === esperados[i]);
    if (!coincide) {
      await client.query('ROLLBACK');
      throw new Error(
        `los ids borrados (${borrados.length}) no coinciden con los inventariados (${esperados.length}); se revirtió`,
      );
    }
    await client.query('COMMIT');
    return borrados.length;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Orquesta reporte y apply sobre `tenants` (`[{ dbName, pool }]`).
 * `fuera` son los clientes fuera del recorrido, solo para el reporte.
 * Devuelve `{ exitCode, borradas }`; nunca llama a `process.exit`.
 */
export async function ejecutarLimpieza({
  tenants,
  fuera = [],
  apply,
  esperadas,
  log = console.log,
}) {
  const inventario = await inventariar(tenants);
  log(formatearReporte(inventario, fuera));

  if (!apply) {
    return { exitCode: inventario.total > 0 ? EXIT_CON_FILAS : EXIT_OK, borradas: 0 };
  }

  if (inventario.total !== esperadas) {
    log(
      `${LOG} ABORTADO: el recuento es ${inventario.total} y se esperaban ${esperadas}. No se borró nada.`,
    );
    return { exitCode: EXIT_ERROR, borradas: 0 };
  }

  let borradas = 0;
  for (const { dbName, pool } of tenants) {
    const inventariadas = inventario.porTenant.find((t) => t.dbName === dbName).filas;
    if (inventariadas.length === 0) continue;
    try {
      const n = await borrarEnTenant(
        pool,
        inventariadas.map((f) => f.id),
      );
      borradas += n;
      log(`${LOG} ${dbName}: ${n} fila(s) borradas`);
    } catch (e) {
      log(`${LOG} ABORTADO en ${dbName}: ${e.message}. Borradas antes del error: ${borradas}.`);
      return { exitCode: EXIT_ERROR, borradas };
    }
  }
  log(`${LOG} OK: ${borradas} fila(s) borradas`);
  return { exitCode: EXIT_OK, borradas };
}

// ── Entry point ──

async function main() {
  try {
    process.loadEnvFile('.env');
  } catch {
    // .env ausente: se usan las variables ya presentes en el entorno.
  }

  const args = parsearArgs(process.argv.slice(2));
  if (args.error) {
    console.error(`${LOG} ${args.error}`);
    return EXIT_ERROR;
  }

  const masterUrl = process.env.DATABASE_URL_MASTER;
  if (!masterUrl) {
    console.error(`${LOG} falta DATABASE_URL_MASTER`);
    return EXIT_ERROR;
  }

  const masterPool = new pg.Pool({ connectionString: masterUrl, connectionTimeoutMillis: 10000 });
  const tenants = [];
  try {
    const { enRecorrido, fuera } = await leerClientes(masterPool);
    for (const { db_name: dbName } of enRecorrido) {
      tenants.push({
        dbName,
        pool: new pg.Pool({
          connectionString: tenantUrl(masterUrl, dbName),
          connectionTimeoutMillis: 10000,
        }),
      });
    }
    const { exitCode } = await ejecutarLimpieza({
      tenants,
      fuera,
      apply: args.apply,
      esperadas: args.esperadas,
    });
    return exitCode;
  } catch (e) {
    console.error(`${LOG} ERROR: ${e.message}`);
    return EXIT_ERROR;
  } finally {
    await Promise.all(tenants.map((t) => t.pool.end().catch(() => undefined)));
    await masterPool.end().catch(() => undefined);
  }
}

// Solo corre si se invoca directamente: los specs importan las funciones sin
// conectarse a ninguna base.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
