// WU-8 (sdd/matriz-permisos-por-usuario) — humo post-deploy, SOLO checks
// read-only sin credenciales de usuario real. Cubre los checks 1-4 de la
// "Verificación post-deploy" del design (§3): el CHECK de la matriz sin
// 'SOPORTE' y sin deriva contra el catálogo, cero filas SOPORTE en
// tipos_ticket, codigo='SOPORTE' intacto, y prefijo SOP- de la numeración
// sin romper.
//
// EL CHECK 1 CAMBIÓ DE SUJETO, y el motivo importa. Consultaba filas de
// `usuario_cliente_modulos`, tabla que `b08066c refactor(auth)!` eliminó a
// propósito: desde entonces este script fallaba con "no existe la relación",
// en TODO deploy, y ese rojo se leyó como ruido. Un chequeo que falla siempre
// no chequea nada.
//
// Y el reemplazo NO es cambiarle el nombre a la tabla. El eje vigente,
// `usuario_cliente_permisos`, tiene un CHECK compuesto que enumera los pares
// `modulo:accion` válidos: una fila 'SOPORTE' es IMPOSIBLE por construcción,
// así que contar filas sería un chequeo que no puede fallar — cambiar un rojo
// permanente por un verde permanente, que se nota menos y engaña más.
//
// Lo que sí puede fallar, y es lo que se verifica: que el CHECK de LA BASE DE
// PRODUCCIÓN enumere exactamente el catálogo del código DESPLEGADO. Eso
// atrapa una migración que no corrió, un CHECK editado a mano, y el regreso
// de 'SOPORTE'. Mismo patrón que el test de deriva de WU-2.1, pero contra
// producción, que es lo que un test de integración no puede mirar. Los checks 5 y 6 (login real de
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
import { createRequire } from 'node:module';

// El catálogo vive en TypeScript; este script es .mjs y corre en el VPS, así
// que se lee del BUILD, no de la fuente. Es a propósito: lo que interesa es el
// catálogo que quedó DESPLEGADO, no el que está en el árbol de trabajo.
// `createRequire` y no `import`: dist/ es CommonJS.
const require = createRequire(import.meta.url);
let PARES_VALIDOS;
try {
  ({ PARES_VALIDOS } = require('../dist/shared/domain/acciones.js'));
} catch (e) {
  console.error(
    '[smoke] no se pudo leer dist/shared/domain/acciones.js — ¿corriste el build?\n         ' +
      e.message,
  );
  process.exit(1);
}

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

const CHECK_MATRIZ = 'usuario_cliente_permisos_modulo_accion_check';

/**
 * Extrae los pares `MODULO:ACCION` de un `pg_get_constraintdef`.
 *
 * El patrón exige DOS grupos en mayúsculas separados por `:` dentro de las
 * comillas. Un `/'([^']+)'/` a secas también captura el separador `':'` que la
 * propia definición usa para concatenar (`modulo || ':' || accion`), y ese par
 * fantasma desalinea el conteo: 34 donde hay 33.
 *
 * @param definicion Texto crudo devuelto por `pg_get_constraintdef`.
 * @returns Los pares encontrados, ordenados.
 */
function paresDelCheck(definicion) {
  return [...definicion.matchAll(/'([A-Z_]+:[A-Z_]+)'/g)].map((m) => m[1]).sort();
}

/**
 * Check 1 — el CHECK de `usuario_cliente_permisos` en la base REAL enumera
 * exactamente el catálogo del código desplegado, y no trae 'SOPORTE' (S17).
 */
async function checkMaster() {
  console.log(`[smoke] 1/4 — ${CHECK_MATRIZ}: sin deriva contra el catálogo, y sin 'SOPORTE'`);
  const pool = new pg.Pool({ connectionString: masterUrl, connectionTimeoutMillis: 10000 });
  try {
    const { rows } = await pool.query(
      'SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = $1',
      [CHECK_MATRIZ],
    );
    if (rows.length === 0) {
      fail(
        `no existe el CHECK ${CHECK_MATRIZ}. Sin el, la base acepta cualquier par (modulo, accion)`,
      );
      return;
    }

    const enLaDb = paresDelCheck(rows[0].def);
    const enElCodigo = [...PARES_VALIDOS].sort();

    const soloDb = enLaDb.filter((p) => !enElCodigo.includes(p));
    const soloCodigo = enElCodigo.filter((p) => !enLaDb.includes(p));

    if (soloDb.length > 0 || soloCodigo.length > 0) {
      fail(
        `deriva entre el CHECK y el catalogo desplegado. ` +
          `Solo en la DB: [${soloDb.join(', ') || '-'}]. ` +
          `Solo en el codigo: [${soloCodigo.join(', ') || '-'}]. ` +
          `Causa tipica: una migracion que no corrio.`,
      );
    } else {
      ok(`el CHECK enumera exactamente los ${enLaDb.length} pares del catalogo desplegado`);
    }

    // Explicito y no implicado por la deriva: si 'SOPORTE' volviera al
    // catalogo Y a la base, la comparacion de arriba pasaria en verde. Este
    // assert guarda la decision de WU-8, que es lo que este smoke existe para
    // custodiar.
    const soporte = enLaDb.filter((p) => p.startsWith('SOPORTE:'));
    if (soporte.length > 0) {
      fail(`el CHECK volvio a admitir SOPORTE: [${soporte.join(', ')}] (WU-8 lo elimino)`);
    } else {
      ok("el CHECK no admite ningun par 'SOPORTE:*'");
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
