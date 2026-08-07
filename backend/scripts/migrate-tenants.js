/**
 * Fan-out de migraciones del schema TENANT a TODAS las DBs tenant activas.
 *
 * Lee master.clientes (db_name de tenants activos), deriva la URL de cada tenant
 * desde DATABASE_URL_MASTER (reemplaza el pathname por /db_name, igual que
 * PrismaService.buildTenantUrl) y corre `prisma migrate deploy` del schema tenant
 * contra cada una, sobreescribiendo DATABASE_URL_TENANT por iteracion (que es lo
 * que lee prisma.tenant.config.ts).
 *
 * Uso (post migrate:master): `pnpm run migrate:tenants`. Lo invoca deploy.ps1.
 * Idempotente: `migrate deploy` no re-aplica migraciones ya aplicadas.
 */
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { Pool } = require('pg');

try {
  process.loadEnvFile();
} catch {
  // .env ausente: se usan las variables ya presentes en el entorno.
}

const masterUrl = process.env.DATABASE_URL_MASTER;
if (!masterUrl) {
  console.error('[migrate-tenants] falta DATABASE_URL_MASTER');
  process.exit(1);
}

// Resolver el CLI de Prisma de forma robusta (sin depender de node_modules/.bin).
const prismaPkgJson = require.resolve('prisma/package.json');
const prismaBin = path.join(path.dirname(prismaPkgJson), require(prismaPkgJson).bin.prisma);

/** URL del tenant = master con el pathname reemplazado por /db_name. */
function tenantUrl(dbName) {
  const u = new URL(masterUrl);
  u.pathname = '/' + dbName;
  return u.toString();
}

(async () => {
  const pool = new Pool({ connectionString: masterUrl, connectionTimeoutMillis: 10000 });
  let dbNames;
  try {
    const { rows } = await pool.query(
      'select db_name from clientes where activo = true and deleted_at is null order by db_name',
    );
    dbNames = rows.map((r) => r.db_name);
  } finally {
    await pool.end();
  }

  if (dbNames.length === 0) {
    console.log('[migrate-tenants] no hay tenants activos, nada que migrar');
    return;
  }
  console.log('[migrate-tenants] ' + dbNames.length + ' tenant(s): ' + dbNames.join(', '));

  for (const dbName of dbNames) {
    console.log('[migrate-tenants] -> ' + dbName);
    execFileSync(
      process.execPath,
      [
        prismaBin,
        'migrate',
        'deploy',
        '--schema=prisma_tenant/schema.prisma',
        '--config',
        'prisma.tenant.config.ts',
      ],
      { stdio: 'inherit', env: { ...process.env, DATABASE_URL_TENANT: tenantUrl(dbName) } },
    );
  }
  console.log('[migrate-tenants] OK, ' + dbNames.length + ' tenant(s) migradas');
})().catch((e) => {
  console.error('[migrate-tenants] ERROR:', e.message);
  process.exit(1);
});
