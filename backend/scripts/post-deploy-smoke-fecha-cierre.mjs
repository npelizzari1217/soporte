// WU5 (sdd/corregir-fecha-cierre-tickets) — humo post-deploy para la migración
// `20260820120000_ticket_fecha_cierre_timestamptz` (design D1/D2/D3).
//
// GOTCHA que motiva este script (ver memoria del proyecto, sesión 2026-08-20):
// dejar `schema.prisma` en `@db.Timestamptz`, aplicar la migración y confirmar
// `udt_name = 'timestamptz'` en `information_schema` NO ALCANZA. Si el cliente
// Prisma generado (`node_modules/.prisma/tenant`, gitignoreado) quedó
// desactualizado — declarando todavía `@db.Date` — Prisma sigue TRUNCANDO la
// hora al escribir aunque la columna física ya acepte el instante completo.
// Ese defecto pasó una corrida completa de la suite en verde porque ningún
// test ejercitaba una escritura real a través de Prisma con el tipo nuevo.
//
// Por eso el check 2 de este script NO es una consulta a information_schema:
// escribe un instante con componente horario dentro de la ventana peligrosa
// (21:00–23:59 ART, la que colapsaba al día UTC siguiente con el bug original)
// a través del PrismaClient real del tenant, lo relee por Prisma, y compara
// milisegundo a milisegundo. Detecta exactamente la clase de defecto que un
// chequeo de solo-schema deja pasar.
//
// Ese round-trip corre DENTRO de una transacción que SIEMPRE se revierte
// (lanza un sentinel al final, éxito o error) — nunca persiste el instante de
// prueba ni modifica ningún ticket real. Mismo criterio de residuo cero que
// `prisma_tenant/ticket-fecha-cierre-timestamptz.integration.spec.ts`.
//
// Precedente de forma: `post-deploy-smoke-matriz-permisos.mjs`. Diferencia
// deliberada: ese es 100% SELECT; este necesita el round-trip de escritura
// (revertida) del check 2 porque es el único chequeo capaz de detectar un
// cliente Prisma desactualizado.
//
// Uso (desde backend/, con backend/.env apuntando a la DB real):
//   node scripts/post-deploy-smoke-fecha-cierre.mjs
// Exit code 0 = todos los checks FAIL-ables pasaron (los WARN no bloquean).
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { createRequire } from 'node:module';

// `.prisma/tenant` es un specifier con punto inicial: inválido para `import`
// ESM (Node lo rechaza por nombre de paquete), pero válido para `require`
// (mismo patrón que usa `prisma-clients.ts` bajo TS/CJS). `createRequire` nos
// da ese `require` dentro de un archivo `.mjs`.
const require = createRequire(import.meta.url);
const { PrismaClient: TenantPrismaClient } = require('.prisma/tenant');

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

/** Instante de prueba dentro de la ventana peligrosa: 2025-12-31 23:34:56 ART
 * (= 2026-01-01T02:34:56.000Z). Antes del fix, un cliente desactualizado lo
 * truncaría a medianoche UTC del día siguiente — un salto de horas fácil de
 * detectar comparando milisegundo a milisegundo. */
const INSTANTE_PRUEBA = new Date('2026-01-01T02:34:56.000Z');

/** Sentinel para forzar ROLLBACK del round-trip de escritura del check 2,
 * tanto si el round-trip tuvo éxito como si no encontró ticket para probar. */
class RollbackIntencional extends Error {}

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

/** Check 1 — tickets.fecha_cierre es timestamptz en TODOS los tenants activos (no solo uno). */
async function checkTipoColumna(pool, dbName) {
  const { rows } = await pool.query(
    `SELECT udt_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'fecha_cierre'`,
  );
  if (rows.length !== 1 || rows[0].udt_name !== 'timestamptz') {
    fail(
      `[${dbName}] tickets.fecha_cierre NO es timestamptz (encontrado: ${rows[0]?.udt_name ?? 'columna ausente'}) — tenant sin migrar`,
    );
  } else {
    ok(`[${dbName}] tickets.fecha_cierre es timestamptz`);
  }
}

/** Check 2 — EL CENTRAL: escritura real a través de Prisma sobrevive con hora
 * intacta. Ver el comentario de cabecera del archivo para el porqué. */
async function checkRoundTripEscritura(dbName) {
  const pool = new pg.Pool({ connectionString: tenantUrl(dbName), connectionTimeoutMillis: 10000 });
  const adapter = new PrismaPg(pool);
  const client = new TenantPrismaClient({ adapter });
  try {
    let resultado = null;
    try {
      await client.$transaction(async (tx) => {
        const ticket = await tx.ticket.findFirst({ select: { id: true, numero: true } });
        if (!ticket) {
          resultado = { sinTickets: true };
          throw new RollbackIntencional();
        }
        await tx.ticket.update({
          where: { id: ticket.id },
          data: { fechaCierre: INSTANTE_PRUEBA },
        });
        const releido = await tx.ticket.findUniqueOrThrow({
          where: { id: ticket.id },
          select: { fechaCierre: true },
        });
        resultado = { numero: ticket.numero, instanteLeido: releido.fechaCierre };
        // SIEMPRE revierte, haya salido bien o mal: este round-trip nunca
        // debe persistir en un tenant real.
        throw new RollbackIntencional();
      });
    } catch (e) {
      if (!(e instanceof RollbackIntencional)) throw e;
    }

    if (resultado?.sinTickets) {
      warn(`[${dbName}] sin tickets para probar el round-trip de escritura (tenant vacío) — omitido`);
      return;
    }
    const sobrevivio = resultado.instanteLeido?.getTime() === INSTANTE_PRUEBA.getTime();
    if (sobrevivio) {
      ok(
        `[${dbName}] round-trip de escritura por Prisma (ticket ${resultado.numero}): la hora sobrevivió intacta — revertido, nada persistido`,
      );
    } else {
      fail(
        `[${dbName}] round-trip de escritura por Prisma (ticket ${resultado.numero}): escribió ${INSTANTE_PRUEBA.toISOString()} y leyó ${resultado.instanteLeido?.toISOString() ?? 'null'} — cliente Prisma generado desactualizado (correr 'pnpm generate:tenant')`,
      );
    }
  } finally {
    await client.$disconnect();
    await pool.end().catch(() => undefined);
  }
}

/** Check 3 — ningún ticket cerrado con instante fuera de rango razonable
 * (posterior a "ahora" o anterior a su propia creación). */
async function checkRangoRazonable(pool, dbName) {
  const { rows } = await pool.query(
    `SELECT numero FROM tickets
     WHERE fecha_cierre IS NOT NULL AND deleted_at IS NULL
       AND (fecha_cierre > now() OR fecha_cierre < created_at)
     ORDER BY numero`,
  );
  if (rows.length > 0) {
    fail(
      `[${dbName}] ${rows.length} ticket(s) con fecha_cierre fuera de rango razonable: ${rows.map((r) => r.numero).join(', ')}`,
    );
  } else {
    ok(`[${dbName}] ningún ticket cerrado con fecha_cierre fuera de rango razonable`);
  }
}

/** Check 4 — filas backfill: si no hay operación de cierre coincidente en
 * operaciones_ticket, D2 dejó la medianoche ART convertida como fallback.
 * Se REPORTA (WARN), nunca se silencia — decisión explícita del design. */
async function checkBackfillSinTransicion(pool, dbName) {
  const { rows } = await pool.query(
    `SELECT t.numero FROM tickets t
     WHERE t.fecha_cierre IS NOT NULL AND t.deleted_at IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM operaciones_ticket op
         JOIN estados e ON e.id = op.estado_nuevo_id
         WHERE op.ticket_id = t.id AND e.codigo IN ('RESUELTO', 'CERRADO') AND op.deleted_at IS NULL
       )
     ORDER BY t.numero`,
  );
  if (rows.length > 0) {
    warn(
      `[${dbName}] ${rows.length} ticket(s) cerrado(s) sin transición de cierre coincidente en operaciones_ticket (conservan la medianoche ART del backfill D2): ${rows.map((r) => r.numero).join(', ')}`,
    );
  } else {
    ok(`[${dbName}] todo ticket cerrado tiene una transición de cierre coincidente`);
  }
}

async function checkTenant(dbName) {
  const pool = new pg.Pool({ connectionString: tenantUrl(dbName), connectionTimeoutMillis: 10000 });
  try {
    await checkTipoColumna(pool, dbName);
    await checkRangoRazonable(pool, dbName);
    await checkBackfillSinTransicion(pool, dbName);
  } finally {
    await pool.end();
  }
  // Aparte: usa su propio pool + PrismaClient (necesita el adapter de Prisma).
  await checkRoundTripEscritura(dbName);
}

(async () => {
  console.log('[smoke] tenants activos');
  const dbNames = await tenantsActivos();
  if (dbNames.length === 0) {
    warn('no hay tenants activos, nada que chequear');
  } else {
    console.log(`[smoke] ${dbNames.length} tenant(s): ${dbNames.join(', ')}`);
  }

  for (const dbName of dbNames) {
    console.log(`[smoke] -- ${dbName} --`);
    await checkTenant(dbName);
  }

  console.log('');
  if (fallas > 0) {
    console.error(`[smoke] ${fallas} check(s) FALLARON. Ver detalle arriba.`);
    process.exit(1);
  }
  console.log('[smoke] Todos los checks pasaron (los WARN no bloquean, solo informan).');
})().catch((e) => {
  console.error('[smoke] ERROR:', e.message);
  process.exit(1);
});
