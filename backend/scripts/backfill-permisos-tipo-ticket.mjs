// Backfill (una sola vez, por tenant) de la tabla `permisos_tipo_ticket`
// (odd/tasks/permisos-por-tipo-ticket.md, T4b, S7): el día del deploy nadie gana ni pierde
// acceso. En cada tipo de ticket, cada usuario recibe las acciones que hoy tiene en el módulo
// de ese tipo según la tabla de L11.
//
// Qué lee:
// - master `usuario_cliente_permisos`: TODAS las celdas del cliente, agrupadas por usuario, sin
//   mirar la membresía. Las membresías desactivadas también se migran (L21): si se reactivan,
//   el usuario vuelve con el acceso que tenía. ROOT y ADMINISTRADOR no tienen celdas (su acceso
//   es un bypass, `resolverScope`), así que no reciben filas.
// - tenant `tipos_ticket`: TODOS los tipos, también los dados de baja. La baja de un tipo es
//   lógica (`deleted_at`, `cambiar-estado-activo-tipo-ticket.use-case.ts`) y se puede revertir,
//   y el gate de módulo de hoy (`findIdsByModulos`) incluye los tipos dados de baja para no
//   ocultar sus tickets. Dejarlos afuera haría que esos tickets dejen de verse al pasar a tipo
//   × acción (T5), y que un tipo reactivado vuelva cerrado: las dos cosas violan S7.
//
// La traducción de L11 vive UNA sola vez, en el dominio (`accionesDeTipoDesdeCeldas`, D4). Este
// script corre en el VPS después del build, así que la lee de `dist/` con `createRequire` (mismo
// criterio que `backfill-tiempos-habiles.mjs`): no se reimplementa acá.
//
// Por defecto es un ENSAYO (dry run): informa conteos y no escribe. Con `--apply` inserta, con
// `ON CONFLICT DO NOTHING`: nunca borra ni actualiza una fila.
//
// SOLO PARA EL PRIMER DEPLOY. Una vez que los administradores editan los permisos por tipo
// (T7), volver a correrlo re-agregaría las acciones que quitaron a mano, porque la fuente
// (la matriz master) todavía no se retira (T9). Por eso `--apply` OMITE un tenant cuya tabla
// ya tiene filas, salvo con `--force`. La guarda también va en la propia sentencia (`NOT
// EXISTS`), así que una fila escrita entre la lectura y el INSERT también la activa. Con la
// guarda, el paso de `deploy.ps1` es un no-op en los deploys siguientes. `--force` completa lo
// que falte y re-agrega lo quitado: usarlo solo sabiendo eso.
//
// Uso (desde backend/, con backend/.env apuntando a la base real, después del build):
//   node scripts/backfill-permisos-tipo-ticket.mjs                    # ensayo
//   node scripts/backfill-permisos-tipo-ticket.mjs --apply            # escribe
//   node scripts/backfill-permisos-tipo-ticket.mjs --apply --force    # escribe aunque ya haya filas
// Nunca imprime URLs ni credenciales: solo el nombre de cada base y sus conteos. Un tenant que
// falla se informa, se sigue con los demás y el script sale con código 1.
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const PREFIJO = '[backfill-permisos-tipo-ticket]';
const ARGS_VALIDOS = ['--apply', '--force'];

/** Lee los argumentos de la línea de comandos. Un argumento desconocido aborta. */
export function parsearArgs(argv) {
  const desconocidos = argv.filter((a) => !ARGS_VALIDOS.includes(a));
  if (desconocidos.length > 0) {
    throw new Error(`argumento desconocido: ${desconocidos.join(' ')} (uso: [--apply] [--force])`);
  }
  return { aplicar: argv.includes('--apply'), forzar: argv.includes('--force') };
}

/**
 * Celdas master de un cliente, agrupadas por usuario, como códigos `MODULO:ACCION`. No filtra
 * por membresía (L21): una membresía desactivada conserva sus celdas y se migra igual.
 *
 * @returns `Map` usuarioId → celdas.
 */
export async function leerCeldasPorUsuario(masterPool, clienteId) {
  const { rows } = await masterPool.query(
    `SELECT "usuario_id", "modulo" || ':' || "accion" AS celda
       FROM "usuario_cliente_permisos"
      WHERE "cliente_id" = $1
      ORDER BY "usuario_id", celda`,
    [clienteId],
  );
  const porUsuario = new Map();
  for (const { usuario_id: usuarioId, celda } of rows) {
    const celdas = porUsuario.get(usuarioId) ?? [];
    celdas.push(celda);
    porUsuario.set(usuarioId, celdas);
  }
  return porUsuario;
}

/**
 * Backfill de UN tenant. Recibe el pool, las celdas y la traducción por parámetro (en vez de
 * abrirlos o cargarlos acá) para que el test lo corra contra una base efímera con el código
 * fuente.
 *
 * @param p.pool                       pool (o cliente) del tenant.
 * @param p.celdasPorUsuario           resultado de `leerCeldasPorUsuario` para este cliente.
 * @param p.accionesDeTipoDesdeCeldas  traducción de L11 del dominio.
 * @param p.aplicar                    `false` = ensayo, no escribe.
 * @param p.forzar                     `true` = escribe aunque la tabla ya tenga filas.
 * @returns `usuarios` (con celdas), `tipos`, `calculadas` (filas de L11), `existentes` (filas
 *          que ya tenía la tabla), `insertadas` y `omitido` (la guarda frenó el `--apply`).
 */
export async function backfillTenant({
  pool,
  celdasPorUsuario,
  accionesDeTipoDesdeCeldas,
  aplicar,
  forzar,
}) {
  const { rows: tipos } = await pool.query(
    `SELECT "id", "modulo" FROM "tipos_ticket" ORDER BY "id"`,
  );
  const filas = [];
  for (const [usuarioId, celdas] of celdasPorUsuario) {
    for (const tipo of tipos) {
      for (const accion of accionesDeTipoDesdeCeldas(celdas, tipo.modulo)) {
        filas.push({ usuarioId, tipoId: tipo.id, accion });
      }
    }
  }

  const { rows: conteo } = await pool.query(
    `SELECT count(*)::int AS n FROM "permisos_tipo_ticket"`,
  );
  const existentes = conteo[0].n;
  const omitido = aplicar && existentes > 0 && !forzar;

  let insertadas = 0;
  if (aplicar && !omitido && filas.length > 0) {
    // Una sola sentencia: el tenant queda entero o sin tocar. El JOIN descarta un tipo borrado
    // físicamente entre la lectura y la escritura; el NOT EXISTS repite la guarda en la
    // sentencia (ve la tabla como estaba al empezar, no las filas que ella misma inserta).
    const r = await pool.query(
      `INSERT INTO "permisos_tipo_ticket" ("usuario_id", "tipo_id", "accion")
       SELECT v.usuario_id, v.tipo_id, v.accion
         FROM unnest($1::uuid[], $2::uuid[], $3::varchar[]) AS v(usuario_id, tipo_id, accion)
         JOIN "tipos_ticket" t ON t."id" = v.tipo_id
        WHERE $4::boolean OR NOT EXISTS (SELECT 1 FROM "permisos_tipo_ticket")
       ON CONFLICT DO NOTHING`,
      [
        filas.map((f) => f.usuarioId),
        filas.map((f) => f.tipoId),
        filas.map((f) => f.accion),
        forzar,
      ],
    );
    insertadas = r.rowCount ?? 0;
  }

  return {
    usuarios: celdasPorUsuario.size,
    tipos: tipos.length,
    calculadas: filas.length,
    existentes,
    insertadas,
    omitido,
  };
}

/** Línea de salida de un tenant: solo el nombre de la base y los conteos. */
export function formatearResultado(dbName, r, aplicar) {
  const base =
    `${PREFIJO} ${dbName}: usuarios ${r.usuarios}, tipos ${r.tipos}, ` +
    `filas calculadas ${r.calculadas}, `;
  if (!aplicar) {
    const aviso =
      r.existentes > 0
        ? ` | la tabla ya tiene ${r.existentes} fila(s): --apply lo omitiria sin --force`
        : '';
    return `${base}insertadas 0 (ensayo)${aviso}`;
  }
  if (r.omitido) {
    return (
      `${base}insertadas 0 | OMITIDO: la tabla ya tiene ${r.existentes} fila(s) ` +
      `(backfill ya corrido o permisos editados); --force para completar igual`
    );
  }
  return `${base}insertadas ${r.insertadas}`;
}

// ── Entry point ──

/** Carga desde el build la traducción de L11 y el helper de sesión UTC. */
function cargarDist() {
  const require = createRequire(import.meta.url);
  try {
    return {
      ...require('../dist/tickets/domain/permisos-tipo-ticket.js'),
      ...require('../dist/shared/infrastructure/persistence/utc-connection-string.js'),
    };
  } catch (e) {
    console.error(`${PREFIJO} no se pudo leer dist/ — ¿corriste el build?\n         ${e.message}`);
    process.exit(1);
  }
}

async function main() {
  let aplicar;
  let forzar;
  try {
    ({ aplicar, forzar } = parsearArgs(process.argv.slice(2)));
  } catch (e) {
    console.error(`${PREFIJO} ${e.message}`);
    process.exit(1);
  }
  const { accionesDeTipoDesdeCeldas, conUtc } = cargarDist();

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
  let fallidos = 0;
  try {
    const { rows: clientes } = await master.query(
      'select id, db_name from clientes where activo = true and deleted_at is null order by db_name',
    );
    console.log(
      `${PREFIJO} ${aplicar ? 'APLICANDO' : 'ENSAYO (sin --apply no escribe)'}` +
        `${forzar ? ' con --force' : ''}; ${clientes.length} tenant(s) activo(s)`,
    );
    for (const { id: clienteId, db_name: dbName } of clientes) {
      const pool = conUtc(tenantUrl(dbName), { connectionTimeoutMillis: 10000 });
      try {
        const celdasPorUsuario = await leerCeldasPorUsuario(master, clienteId);
        const r = await backfillTenant({
          pool,
          celdasPorUsuario,
          accionesDeTipoDesdeCeldas,
          aplicar,
          forzar,
        });
        console.log(formatearResultado(dbName, r, aplicar));
      } catch (e) {
        fallidos += 1;
        console.error(`${PREFIJO} ${dbName}: ERROR ${e.message}`);
      } finally {
        await pool.end();
      }
    }
  } finally {
    await master.end();
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
