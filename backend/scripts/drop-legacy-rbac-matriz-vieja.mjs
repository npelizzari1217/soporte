// WU-9 (sdd/matriz-permisos-por-usuario) — DROP de la red de rollback vieja
// (roles_permisos, permisos, usuario_cliente_modulos). PUNTO DE NO RETORNO.
//
// Ref design: sdd/matriz-permisos-por-usuario/design §3, "Paso 5 · Contract
// (deploy posterior, después de confirmar paridad)". Ref tasks: WU-9.
//
// Deliberadamente NO vive en prisma_master/migrations/: si estuviera ahí,
// la PRÓXIMA corrida de `prisma migrate deploy` (pnpm run migrate:master,
// que deploy.ps1 corre sin condiciones en CADA deploy) la aplicaría sola,
// en el MISMO deploy que WU-7/WU-8 — exactamente lo que este work unit
// prohíbe ("diferido a un deploy POSTERIOR", no al mismo). Por eso es un
// script aparte con un gate de confirmación explícito, mismo patrón que
// scripts/backfill-modulos-5.2.mjs (otro one-off que tampoco vive en
// prisma_master/migrations/).
//
// Irreversible: a diferencia del rename SOPORTE→TICKETS (WU-7.2, ADR-P8),
// que tenía un UPDATE inverso preparado, acá no hay un INSERT inverso
// posible una vez corrido el DROP — se pierde el dato que reconstruiría
// roles_permisos/permisos/usuario_cliente_modulos. El único rollback real
// es un restore de backup de la base master.
//
// Uso:
//   node scripts/drop-legacy-rbac-matriz-vieja.mjs            → solo REPORTA conteos, no toca nada
//   node scripts/drop-legacy-rbac-matriz-vieja.mjs --confirmar → ejecuta el DROP
//
// Antes de correr con --confirmar:
//   1. Confirmar que el deploy en producción YA incluye el fix post-verify C2
//      (sdd/matriz-permisos-por-usuario): PrismaMembresiaRepository ya NO
//      incluye `rol.rolesPermisos` en el JOIN de login/switch/refresh, y
//      PrismaRoleRepository.findWithPermisos fue retirado. Sin ese fix, este
//      DROP tumba el login entero (`relation "roles_permisos" does not
//      exist`, 500) — antes de C2 esa lectura corría en CADA request de auth.
//   2. Confirmar en producción real, durante un período de observación
//      posterior al deploy que introduce la matriz nueva, los 6 checks de
//      docs/post-deploy-matriz-permisos.md (WU-8).
import { readFileSync } from 'node:fs';
import pg from 'pg';

try {
  process.loadEnvFile();
} catch {
  // .env ausente: se usan las variables ya presentes en el entorno.
}

const connectionString = process.env.DATABASE_URL_MASTER;
if (!connectionString) {
  console.error('[drop-legacy-rbac] falta DATABASE_URL_MASTER');
  process.exit(1);
}

const confirmar = process.argv.includes('--confirmar');
const pool = new pg.Pool({ connectionString });

try {
  const { rows } = await pool.query(`
    SELECT
      (SELECT count(*)::int FROM roles_permisos)          AS roles_permisos,
      (SELECT count(*)::int FROM permisos)                AS permisos,
      (SELECT count(*)::int FROM usuario_cliente_modulos) AS usuario_cliente_modulos
  `);
  const conteos = rows[0];
  console.log('[drop-legacy-rbac] Filas actuales antes del DROP:');
  console.log('  roles_permisos:          ' + conteos.roles_permisos);
  console.log('  permisos:                ' + conteos.permisos);
  console.log('  usuario_cliente_modulos: ' + conteos.usuario_cliente_modulos);

  if (!confirmar) {
    console.log('');
    console.log('[drop-legacy-rbac] Modo REPORTE (sin --confirmar): no se tocó ninguna tabla.');
    console.log('[drop-legacy-rbac] Antes de correr con --confirmar:');
    console.log('  1. Confirmar que el deploy YA incluye el fix C2 (PrismaMembresiaRepository/');
    console.log(
      '     PrismaRoleRepository sin JOIN a roles_permisos/permisos) — sin eso, este DROP',
    );
    console.log('     rompe el login (500 en cada request de auth).');
    console.log(
      '  2. Confirmar en producción real los 6 checks de docs/post-deploy-matriz-permisos.md',
    );
    console.log(
      '     durante un período de observación posterior al deploy (WU-9 es un deploy POSTERIOR).',
    );
    process.exit(0);
  }

  console.log('');
  console.log('[drop-legacy-rbac] --confirmar presente. Ejecutando DROP (IRREVERSIBLE)...');
  const sql = readFileSync(new URL('./drop-legacy-rbac-matriz-vieja.sql', import.meta.url), 'utf8');
  await pool.query(sql);
  console.log(
    '[drop-legacy-rbac] OK. roles_permisos, permisos y usuario_cliente_modulos eliminadas.',
  );
} catch (e) {
  console.error('[drop-legacy-rbac] ERROR:', e.message);
  process.exit(1);
} finally {
  await pool.end();
}
