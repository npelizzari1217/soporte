// WU-8 (sdd/matriz-permisos-por-usuario) — humo post-deploy, SOLO checks
// read-only sin credenciales de usuario real. Cubre los checks 1-4 de la
// "Verificación post-deploy" del design (§3): cero filas SOPORTE en
// usuario_cliente_modulos y en tipos_ticket, codigo='SOPORTE' intacto, y
// prefijo SOP- de la numeración sin romper. Los checks 5 y 6 (login real de
// un TECNICO y de un ADMINISTRADOR) NO se automatizan acá — requieren
// credenciales de producción y sesión de navegador, ver el procedimiento
// manual en docs/post-deploy-matriz-permisos.md.
//
// No crea, edita ni borra ningún dato: solo SELECT. Seguro de correr en
// producción las veces que haga falta.
//
// Uso (desde backend/, con backend/.env apuntando a la DB real):
//   node scripts/post-deploy-smoke-matriz-permisos.mjs
// Exit code 0 = los 4 checks automatizables pasaron. 1 = alguno falló.
import pg from 'pg';

try {
  process.loadEnvFile();
} catch {
  // .env ausente: se usan las variables ya presentes en el entorno.
}

const masterUrl = process.env.DATABASE_URL_MASTER;
if (!masterUrl) {
  console.error('[smoke] falta DATABASE_URL_MASTER');
  process.exit(1);
}

/** URL del tenant = master con el pathname reemplazado por /db_name (mismo criterio que scripts/migrate-tenants.js). */
function tenantUrl(dbName) {
  const u = new URL(masterUrl);
  u.pathname = '/' + dbName;
  return u.toString();
}

const REGEX_NUMERO_SOPORTE = /^SOP-\d{4}-\d{5}$/;

let fallas = 0;
function ok(msg) {
  console.log('  OK   ' + msg);
}
function warn(msg) {
  console.log('  WARN ' + msg);
}
function fail(msg) {
  console.log('  FAIL ' + msg);
  fallas += 1;
}

/** Check 1 — usuario_cliente_modulos (master) sin filas con modulo='SOPORTE' (S17). */
async function checkMaster() {
  console.log("[smoke] 1/4 — usuario_cliente_modulos (master): sin filas 'SOPORTE'");
  const pool = new pg.Pool({ connectionString: masterUrl, connectionTimeoutMillis: 10000 });
  try {
    const { rows } = await pool.query(
      'SELECT modulo, count(*)::int AS n FROM usuario_cliente_modulos GROUP BY 1 ORDER BY 1',
    );
    const soporte = rows.find((r) => r.modulo === 'SOPORTE');
    if (soporte) {
      fail(`quedan ${soporte.n} fila(s) con modulo='SOPORTE' en usuario_cliente_modulos`);
    } else {
      ok(`0 filas SOPORTE (${rows.length} módulo(s) distinto(s) presentes)`);
    }
  } finally {
    await pool.end();
  }
}

async function tenantsActivos() {
  const pool = new pg.Pool({ connectionString: masterUrl, connectionTimeoutMillis: 10000 });
  try {
    const { rows } = await pool.query(
      'SELECT db_name FROM clientes WHERE activo = true AND deleted_at IS NULL ORDER BY db_name',
    );
    return rows.map((r) => r.db_name);
  } finally {
    await pool.end();
  }
}

/** Checks 2, 3 y 4 sobre un tenant: modulo de tipos_ticket, codigo intacto, prefijo de numeración. */
async function checkTenant(dbName) {
  const pool = new pg.Pool({ connectionString: tenantUrl(dbName), connectionTimeoutMillis: 10000 });
  try {
    // Check 2 — tipos_ticket.modulo sin 'SOPORTE' (S18).
    const { rows: modulos } = await pool.query(
      'SELECT modulo, count(*)::int AS n FROM tipos_ticket GROUP BY 1 ORDER BY 1',
    );
    const soporteModulo = modulos.find((r) => r.modulo === 'SOPORTE');
    if (soporteModulo) {
      fail(`[${dbName}] quedan ${soporteModulo.n} tipo(s) de ticket con modulo='SOPORTE'`);
    } else {
      ok(`[${dbName}] tipos_ticket sin modulo='SOPORTE' (${modulos.length} módulo(s) distinto(s))`);
    }

    // Check 3 — codigo='SOPORTE' sigue existiendo, no se tocó (R8).
    const { rows: tipoSoporte } = await pool.query(
      "SELECT id FROM tipos_ticket WHERE codigo = 'SOPORTE'",
    );
    if (tipoSoporte.length === 0) {
      warn(
        `[${dbName}] no tiene un tipo de ticket con codigo='SOPORTE' (puede ser normal si el tenant lo borró/renombró a mano antes del deploy)`,
      );
    } else {
      ok(`[${dbName}] codigo='SOPORTE' intacto`);
    }

    // Check 4 — el último ticket SOPORTE conocido sigue numerando con prefijo
    // SOP- (lectura, no crea datos nuevos: la confirmación definitiva de "un
    // ticket NUEVO numera SOP-" es el paso manual 4 del runbook).
    const { rows: ultimoTicket } = await pool.query(
      `SELECT t.numero
         FROM tickets t
         JOIN tipos_ticket tt ON tt.id = t.tipo_id
        WHERE tt.codigo = 'SOPORTE'
        ORDER BY t.created_at DESC
        LIMIT 1`,
    );
    if (ultimoTicket.length === 0) {
      warn(
        `[${dbName}] sin tickets de tipo SOPORTE todavía, no se puede verificar el prefijo por lectura`,
      );
    } else if (REGEX_NUMERO_SOPORTE.test(ultimoTicket[0].numero)) {
      ok(
        `[${dbName}] último ticket SOPORTE numera '${ultimoTicket[0].numero}' (prefijo SOP- intacto)`,
      );
    } else {
      fail(
        `[${dbName}] último ticket SOPORTE numera '${ultimoTicket[0].numero}', esperado formato SOP-AAAA-NNNNN`,
      );
    }
  } finally {
    await pool.end();
  }
}

(async () => {
  await checkMaster();

  console.log('[smoke] 2-4/4 — tipos_ticket por tenant activo (modulo, codigo, numeración)');
  const dbNames = await tenantsActivos();
  if (dbNames.length === 0) {
    warn('no hay tenants activos, nada que chequear a nivel tenant');
  }
  for (const dbName of dbNames) {
    await checkTenant(dbName);
  }

  console.log('');
  if (fallas > 0) {
    console.error(`[smoke] ${fallas} check(s) FALLARON. Ver detalle arriba.`);
    console.error(
      '[smoke] Los checks 5 y 6 (login real de TECNICO/ADMINISTRADOR) son MANUALES, ver docs/post-deploy-matriz-permisos.md.',
    );
    process.exit(1);
  }
  console.log('[smoke] Los 4 checks automatizables pasaron.');
  console.log(
    '[smoke] Los checks 5 y 6 (login real de TECNICO/ADMINISTRADOR) son MANUALES, ver docs/post-deploy-matriz-permisos.md.',
  );
})().catch((e) => {
  console.error('[smoke] ERROR:', e.message);
  process.exit(1);
});
