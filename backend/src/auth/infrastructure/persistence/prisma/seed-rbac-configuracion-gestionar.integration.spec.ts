/**
 * 1.5 — RED/GREEN: Integración — seed_rbac_configuracion_gestionar (PR1).
 *
 * Verifica que la migración 20260701010000_seed_rbac_configuracion_gestionar
 * siembre el permiso `configuracion:gestionar` (UUID b0..020) y lo asigne al
 * rol admin REALMENTE activo (`ADMINISTRADOR` — ver nota de desviación en el
 * propio archivo de migración: el rol legacy `ADMIN` está soft-deleted desde
 * `20260629110000_remap_usuarios_roles`).
 *
 * Estrategia TDD (mismo patrón que rbac-4-roles-seed.integration.spec.ts):
 *   RED  → ANTES de crear migration.sql: beforeAll lanza ENOENT.
 *   GREEN → DESPUÉS de crear migration.sql: beforeAll aplica el SQL y los tests pasan.
 *
 * Configuración de DB: DATABASE_URL_MASTER del entorno o fallback local de test.
 *
 * Ref design: §9, F4. Ref spec: R4 (seed idempotente). Ref tasks: PR1 1.3, 1.5.
 */
import * as fs from 'fs';
import * as path from 'path';
import { Pool } from 'pg';

const TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

// Prerequisite: 4-roles seed (ADMINISTRADOR debe existir, a0..009).
const PREREQ_MIGRATION_FILE = path.resolve(
  __dirname,
  '../../../../../prisma_master/migrations/20260629100000_seed_rbac_4_roles/migration.sql',
);

// El archivo que este test pone en RED/GREEN.
const MIGRATION_FILE = path.resolve(
  __dirname,
  '../../../../../prisma_master/migrations/20260701010000_seed_rbac_configuracion_gestionar/migration.sql',
);

const PERMISO_ID = 'b0000000-0000-4000-b000-000000000020';

describe('Migration: seed_rbac_configuracion_gestionar (integration — PR1)', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_URL });
    const prereqSql = fs.readFileSync(PREREQ_MIGRATION_FILE, 'utf8');
    await pool.query(prereqSql);
    const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
    await pool.query(sql);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('siembra el permiso configuracion:gestionar con UUID b0..020 y deleted_at IS NULL', async () => {
    const { rows } = await pool.query(
      "SELECT id, deleted_at FROM permisos WHERE codigo = 'configuracion:gestionar'",
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(PERMISO_ID);
    expect(rows[0].deleted_at).toBeNull();
  });

  it('asigna el permiso al rol ADMINISTRADOR (rol admin realmente activo, no el ADMIN legacy soft-deleted)', async () => {
    const { rows } = await pool.query(
      `SELECT rp.permiso_id
       FROM roles_permisos rp
       JOIN roles r ON r.id = rp.rol_id
       WHERE r.codigo = 'ADMINISTRADOR' AND rp.permiso_id = $1`,
      [PERMISO_ID],
    );

    expect(rows).toHaveLength(1);
  });

  it('la migración NO referencia el rol ADMIN legacy — solo asigna a ADMINISTRADOR (chequeo estático, no de DB)', () => {
    // NOTA: un chequeo contra la DB compartida de test ("SELECT ... WHERE
    // r.codigo='ADMIN'") NO es confiable acá: `rbac-seed.integration.spec.ts`
    // (archivo preexistente, fuera de este change) re-ejecuta como parte de
    // SU PROPIO test de idempotencia la SQL LITERAL de la migración original
    // `20260623010000_seed_rbac_base`, que asigna a 'ADMIN' TODOS los
    // permisos existentes en la tabla `permisos` vía CROSS JOIN sin filtro de
    // código — una vez que `configuracion:gestionar` existe en el catálogo,
    // esa re-ejecución (ajena a esta migración) inserta la fila
    // ADMIN+configuracion:gestionar en la DB compartida de test. Es un
    // efecto de orden de ejecución entre archivos de spec independientes
    // (mismo patrón de flakiness documentado en
    // openspec/changes/notif-email-estado-ticket/STATE.md), NO algo que
    // controle esta migración. Por eso el chequeo real es estático: la
    // migración de ESTE PR nunca contiene el string 'ADMIN' como target.
    const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');

    // "= 'ADMIN'" (con la comilla de cierre inmediatamente después) NO
    // aparece dentro de "= 'ADMINISTRADOR'" — el substring es inequívoco.
    expect(sql).not.toContain("= 'ADMIN'");
    expect(sql).toContain("= 'ADMINISTRADOR'");
  });

  it('re-ejecutar la migración es idempotente — no duplica el permiso ni la asignación a ADMINISTRADOR (R4 seed idempotente)', async () => {
    // Scoped a ADMINISTRADOR (no un COUNT global de roles_permisos por
    // permiso_id): otro spec preexistente y ajeno a este change
    // (`rbac-seed.integration.spec.ts`) puede, en algún momento de la corrida
    // completa de la suite, agregar una fila ADMIN+configuracion:gestionar al
    // re-ejecutar SU propia SQL histórica (ver comentario del test anterior)
    // — eso NO es responsabilidad de esta migración ni debe hacer flakear
    // este test de idempotencia scoped a ADMINISTRADOR.
    const countAdministrador = () =>
      pool.query<{ count: string }>(
        `SELECT COUNT(*) FROM roles_permisos rp
         JOIN roles r ON r.id = rp.rol_id
         WHERE r.codigo = 'ADMINISTRADOR' AND rp.permiso_id = $1`,
        [PERMISO_ID],
      );

    const [permisosBefore, rpBefore] = await Promise.all([
      pool.query<{ count: string }>(
        "SELECT COUNT(*) FROM permisos WHERE codigo = 'configuracion:gestionar'",
      ),
      countAdministrador(),
    ]);

    const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
    await pool.query(sql);
    await pool.query(sql); // 2 veces adicionales — refuerza la garantía de idempotencia

    const [permisosAfter, rpAfter] = await Promise.all([
      pool.query<{ count: string }>(
        "SELECT COUNT(*) FROM permisos WHERE codigo = 'configuracion:gestionar'",
      ),
      countAdministrador(),
    ]);

    expect(permisosAfter.rows[0].count).toBe(permisosBefore.rows[0].count);
    expect(permisosAfter.rows[0].count).toBe('1');
    expect(rpAfter.rows[0].count).toBe(rpBefore.rows[0].count);
    expect(rpAfter.rows[0].count).toBe('1');
  });
});
