/**
 * Backfill one-off (pre-contract, PR4a): puebla componentes_equipo.tipo_componente_codigo
 * en TODAS las DBs tenant activas, a partir del tipo_componente_id existente.
 *
 * Fan-out sobre tenants activos (patron de migrate-tenants.js): lee
 * master.clientes (db_name de tenants activos), deriva la URL de cada tenant
 * desde DATABASE_URL_MASTER (reemplaza el pathname por /db_name, igual que
 * PrismaService.buildTenantUrl) y corre el UPDATE de backfill contra cada una.
 *
 * Idempotente: el UPDATE solo toca filas con tipo_componente_codigo IS NULL.
 *
 * Gate de PR4b: este script DEBE dejar cero filas con tipo_componente_codigo
 * NULL en TODOS los tenants antes de correr la migracion contract (que agrega
 * NOT NULL + elimina tipo_componente_id / la tabla tipos_componente tenant).
 * Si algun tenant queda con nulls, el fan-out aborta (exit 1) sin continuar
 * con el resto — no se debe avanzar a PR4b hasta que esto de limpio.
 *
 * Uso: `node scripts/backfill-tipos-componente-codigo.js` desde backend/.
 */
const { Pool } = require('pg');

try {
  process.loadEnvFile();
} catch {
  // .env ausente: se usan las variables ya presentes en el entorno.
}

const masterUrl = process.env.DATABASE_URL_MASTER;
if (!masterUrl) {
  console.error('[backfill-tipos-componente-codigo] falta DATABASE_URL_MASTER');
  process.exit(1);
}

const UPDATE_SQL = `
  UPDATE componentes_equipo c
  SET tipo_componente_codigo = t.codigo
  FROM tipos_componente t
  WHERE c.tipo_componente_id = t.id
    AND c.tipo_componente_codigo IS NULL;
`;

const COUNT_NULLS_SQL = `
  SELECT count(*)::int AS n
  FROM componentes_equipo
  WHERE tipo_componente_codigo IS NULL;
`;

/** URL del tenant = master con el pathname reemplazado por /db_name. */
function tenantUrl(dbName) {
  const u = new URL(masterUrl);
  u.pathname = '/' + dbName;
  return u.toString();
}

(async () => {
  const masterPool = new Pool({ connectionString: masterUrl, connectionTimeoutMillis: 10000 });
  let dbNames;
  try {
    const { rows } = await masterPool.query(
      'select db_name from clientes where activo = true and deleted_at is null order by db_name',
    );
    dbNames = rows.map((r) => r.db_name);
  } finally {
    await masterPool.end();
  }

  if (dbNames.length === 0) {
    console.log('[backfill-tipos-componente-codigo] no hay tenants activos, nada que backfillear');
    return;
  }
  console.log(
    '[backfill-tipos-componente-codigo] ' + dbNames.length + ' tenant(s): ' + dbNames.join(', '),
  );

  for (const dbName of dbNames) {
    const tenantPool = new Pool({
      connectionString: tenantUrl(dbName),
      connectionTimeoutMillis: 10000,
    });
    try {
      const updateResult = await tenantPool.query(UPDATE_SQL);
      const { rows } = await tenantPool.query(COUNT_NULLS_SQL);
      const nullsRestantes = rows[0].n;

      console.log(
        '[backfill-tipos-componente-codigo] -> ' +
          dbName +
          ': ' +
          updateResult.rowCount +
          ' fila(s) actualizadas, ' +
          nullsRestantes +
          ' null(s) restantes',
      );

      if (nullsRestantes > 0) {
        console.error(
          '[backfill-tipos-componente-codigo] ABORTADO: ' +
            dbName +
            ' quedo con ' +
            nullsRestantes +
            ' fila(s) con tipo_componente_codigo NULL tras el backfill. ' +
            'Revisar componentes con tipo_componente_id huerfano antes de reintentar. ' +
            'No se continua con el resto de los tenants.',
        );
        process.exit(1);
      }
    } finally {
      await tenantPool.end();
    }
  }

  console.log(
    '[backfill-tipos-componente-codigo] OK, ' +
      dbNames.length +
      ' tenant(s) sin nulls en tipo_componente_codigo',
  );
})().catch((e) => {
  console.error('[backfill-tipos-componente-codigo] ERROR:', e.message);
  process.exit(1);
});
