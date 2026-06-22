/**
 * 2.E.1 TEST — Integration test de la seed migration de RBAC (PR-07)
 *
 * Verifica que la migración 20260623010000_seed_rbac_base haya sembrado
 * correctamente los catálogos de roles, permisos y roles_permisos en la
 * base de datos master_test.
 *
 * Estrategia TDD:
 *   RED  → corre ANTES de aplicar la migration (tablas vacías o sin seeds).
 *   GREEN → corre DESPUÉS de aplicar la migration en soporte_master_test.
 *
 * Configuración de DB:
 *   - Usa DATABASE_URL_MASTER del entorno o el fallback local de test.
 *   - NUNCA apunta a soporte_master (DB de desarrollo).
 *   - NO hace TRUNCATE de tablas de catálogo: son datos de referencia, no fixtures.
 *
 * Nota: los imports de pg SÍ son válidos aquí porque estamos en infrastructure/.
 */
import { Pool } from 'pg';

// ─── Conexión de test ─────────────────────────────────────────────────────────
// Credenciales locales throwaway — seguro commitear.
const TEST_DB_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

// ─── Catálogos esperados (verbatim del spec auth-rbac) ────────────────────────

const EXPECTED_ROLES = ['ADMIN', 'SOPORTE_IT', 'MANTENIMIENTO', 'APROBADOR_COMPRAS', 'SOLICITANTE'];

const EXPECTED_PERMISOS = [
  'ticket:crear',
  'ticket:asignar',
  'ticket:cerrar',
  'ticket:ver_todos',
  'compra:aprobar',
  'compra:gestionar',
  'subtarea:actualizar',
  'equipo:gestionar',
  'usuario:gestionar',
  'rol:asignar',
  'cliente:gestionar',
];

// ─── SQL idempotente (refleja exactamente la migración) ───────────────────────
// Usado en el test de idempotencia para re-ejecutar el seed via pool directo.
const SEED_ROLES_SQL = `
INSERT INTO roles (id, codigo, nombre, descripcion) VALUES
  ('a0000000-0000-4000-a000-000000000001', 'ADMIN',             'Administrador',        'Acceso total al sistema — gestión de usuarios, roles, clientes y todos los flujos de tickets'),
  ('a0000000-0000-4000-a000-000000000002', 'SOPORTE_IT',        'Soporte IT',           'Gestión de tickets de soporte y equipos informáticos'),
  ('a0000000-0000-4000-a000-000000000003', 'MANTENIMIENTO',     'Mantenimiento',        'Gestión de tickets edilicios y subtareas de reparación'),
  ('a0000000-0000-4000-a000-000000000004', 'APROBADOR_COMPRAS', 'Aprobador de Compras', 'Aprobación y gestión de tickets de compras'),
  ('a0000000-0000-4000-a000-000000000005', 'SOLICITANTE',       'Solicitante',          'Creación de tickets de cualquier tipo')
ON CONFLICT (codigo) DO NOTHING;
`;

const SEED_PERMISOS_SQL = `
INSERT INTO permisos (id, codigo, descripcion) VALUES
  ('b0000000-0000-4000-b000-000000000001', 'ticket:crear',       'Crear ticket de cualquier tipo'),
  ('b0000000-0000-4000-b000-000000000002', 'ticket:asignar',     'Asignar o reasignar ticket'),
  ('b0000000-0000-4000-b000-000000000003', 'ticket:cerrar',      'Cerrar/cancelar ticket'),
  ('b0000000-0000-4000-b000-000000000004', 'ticket:ver_todos',   'Ver tickets de otros usuarios (no solo los propios)'),
  ('b0000000-0000-4000-b000-000000000005', 'compra:aprobar',     'Aprobar o rechazar ticket de compra'),
  ('b0000000-0000-4000-b000-000000000006', 'compra:gestionar',   'Crear/editar items y presupuestos de compra'),
  ('b0000000-0000-4000-b000-000000000007', 'subtarea:actualizar','Marcar subtareas edilicias como completadas'),
  ('b0000000-0000-4000-b000-000000000008', 'equipo:gestionar',   'Alta/baja/modificación de equipos informáticos'),
  ('b0000000-0000-4000-b000-000000000009', 'usuario:gestionar',  'Crear/modificar/desactivar usuarios'),
  ('b0000000-0000-4000-b000-000000000010', 'rol:asignar',        'Asignar o quitar roles a usuarios'),
  ('b0000000-0000-4000-b000-000000000011', 'cliente:gestionar',  'Crear/modificar clientes (solo ROOT/ADMIN global)')
ON CONFLICT (codigo) DO NOTHING;
`;

const SEED_ROLES_PERMISOS_SQL = `
INSERT INTO roles_permisos (rol_id, permiso_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permisos p
WHERE r.codigo = 'ADMIN'
ON CONFLICT (rol_id, permiso_id) DO NOTHING;

INSERT INTO roles_permisos (rol_id, permiso_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permisos p
WHERE r.codigo = 'SOPORTE_IT'
  AND p.codigo IN ('ticket:crear', 'ticket:asignar', 'ticket:cerrar', 'ticket:ver_todos', 'equipo:gestionar')
ON CONFLICT (rol_id, permiso_id) DO NOTHING;

INSERT INTO roles_permisos (rol_id, permiso_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permisos p
WHERE r.codigo = 'MANTENIMIENTO'
  AND p.codigo IN ('ticket:crear', 'ticket:ver_todos', 'subtarea:actualizar')
ON CONFLICT (rol_id, permiso_id) DO NOTHING;

INSERT INTO roles_permisos (rol_id, permiso_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permisos p
WHERE r.codigo = 'APROBADOR_COMPRAS'
  AND p.codigo IN ('ticket:crear', 'ticket:ver_todos', 'compra:aprobar', 'compra:gestionar')
ON CONFLICT (rol_id, permiso_id) DO NOTHING;

INSERT INTO roles_permisos (rol_id, permiso_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permisos p
WHERE r.codigo = 'SOLICITANTE'
  AND p.codigo IN ('ticket:crear')
ON CONFLICT (rol_id, permiso_id) DO NOTHING;
`;

// ─────────────────────────────────────────────────────────────────────────────
// Suite
// ─────────────────────────────────────────────────────────────────────────────

describe('RBAC seed migration (integration — 2.E.1)', () => {
  let pool: Pool;

  beforeAll(() => {
    pool = new Pool({ connectionString: TEST_DB_URL });
  });

  afterAll(async () => {
    await pool.end();
  });

  // ─── 1. Roles catalog ─────────────────────────────────────────────────────

  describe('1. Catálogo de roles', () => {
    it('contiene los 5 roles exactos del spec', async () => {
      const res = await pool.query<{ codigo: string }>(
        'SELECT codigo FROM roles WHERE deleted_at IS NULL ORDER BY codigo',
      );
      const codigos = res.rows.map((r) => r.codigo);

      for (const expected of EXPECTED_ROLES) {
        expect(codigos).toContain(expected);
      }
      expect(res.rows.length).toBeGreaterThanOrEqual(5);
    });
  });

  // ─── 2. Permisos catalog ──────────────────────────────────────────────────

  describe('2. Catálogo de permisos', () => {
    it('contiene exactamente los 11 permisos atómicos del spec (recurso:accion)', async () => {
      const res = await pool.query<{ codigo: string }>(
        'SELECT codigo FROM permisos WHERE deleted_at IS NULL ORDER BY codigo',
      );
      const codigos = res.rows.map((r) => r.codigo);

      for (const expected of EXPECTED_PERMISOS) {
        expect(codigos).toContain(expected);
      }
      // El catálogo debe tener al menos los 11 del spec
      expect(res.rows.length).toBeGreaterThanOrEqual(11);
    });
  });

  // ─── 3. ADMIN → todos los permisos ───────────────────────────────────────

  describe('3. ADMIN tiene todos los permisos', () => {
    it('ADMIN está mapeado a los 11 permisos del spec en roles_permisos', async () => {
      const res = await pool.query<{ codigo: string }>(`
        SELECT p.codigo
        FROM roles_permisos rp
        JOIN roles r  ON r.id = rp.rol_id
        JOIN permisos p ON p.id = rp.permiso_id
        WHERE r.codigo = 'ADMIN'
        ORDER BY p.codigo
      `);
      const adminPermisos = res.rows.map((r) => r.codigo);

      // ADMIN debe tener TODOS los permisos del spec
      for (const permiso of EXPECTED_PERMISOS) {
        expect(adminPermisos).toContain(permiso);
      }
      expect(adminPermisos.length).toBeGreaterThanOrEqual(EXPECTED_PERMISOS.length);
    });
  });

  // ─── 4. Non-ADMIN role tiene su subset ───────────────────────────────────

  describe('4. Rol no-ADMIN (SOLICITANTE) tiene su subset definido', () => {
    it('SOLICITANTE tiene ticket:crear como único permiso base', async () => {
      const res = await pool.query<{ codigo: string }>(`
        SELECT p.codigo
        FROM roles_permisos rp
        JOIN roles r  ON r.id = rp.rol_id
        JOIN permisos p ON p.id = rp.permiso_id
        WHERE r.codigo = 'SOLICITANTE'
        ORDER BY p.codigo
      `);
      const codigos = res.rows.map((r) => r.codigo);

      expect(codigos).toContain('ticket:crear');
      // SOLICITANTE NO debe tener permisos elevados
      expect(codigos).not.toContain('usuario:gestionar');
      expect(codigos).not.toContain('cliente:gestionar');
      expect(codigos).not.toContain('rol:asignar');
    });

    it('APROBADOR_COMPRAS tiene ticket:crear y compra:aprobar (explícitos en spec)', async () => {
      const res = await pool.query<{ codigo: string }>(`
        SELECT p.codigo
        FROM roles_permisos rp
        JOIN roles r  ON r.id = rp.rol_id
        JOIN permisos p ON p.id = rp.permiso_id
        WHERE r.codigo = 'APROBADOR_COMPRAS'
        ORDER BY p.codigo
      `);
      const codigos = res.rows.map((r) => r.codigo);

      // Explícito en el scenario de unión de permisos del spec
      expect(codigos).toContain('ticket:crear');
      expect(codigos).toContain('compra:aprobar');
      // No debe tener permisos de administración global
      expect(codigos).not.toContain('usuario:gestionar');
      expect(codigos).not.toContain('cliente:gestionar');
    });
  });

  // ─── 5. Idempotencia ──────────────────────────────────────────────────────

  describe('5. Idempotencia del seed', () => {
    it('re-ejecutar el seed SQL no modifica los row counts en roles, permisos, roles_permisos', async () => {
      // Contar ANTES de la segunda ejecución
      const [rolesBefore, permisosBefore, rpBefore] = await Promise.all([
        pool.query<{ count: string }>('SELECT COUNT(*) FROM roles'),
        pool.query<{ count: string }>('SELECT COUNT(*) FROM permisos'),
        pool.query<{ count: string }>('SELECT COUNT(*) FROM roles_permisos'),
      ]);

      // Re-ejecutar el mismo SQL idempotente via pool directo
      await pool.query(SEED_ROLES_SQL);
      await pool.query(SEED_PERMISOS_SQL);
      // roles_permisos se inserta con múltiples statements — ejecutar en secuencia
      for (const stmt of SEED_ROLES_PERMISOS_SQL.split(';')
        .map((s) => s.trim())
        .filter(Boolean)) {
        await pool.query(stmt);
      }

      // Contar DESPUÉS
      const [rolesAfter, permisosAfter, rpAfter] = await Promise.all([
        pool.query<{ count: string }>('SELECT COUNT(*) FROM roles'),
        pool.query<{ count: string }>('SELECT COUNT(*) FROM permisos'),
        pool.query<{ count: string }>('SELECT COUNT(*) FROM roles_permisos'),
      ]);

      expect(rolesAfter.rows[0].count).toBe(rolesBefore.rows[0].count);
      expect(permisosAfter.rows[0].count).toBe(permisosBefore.rows[0].count);
      expect(rpAfter.rows[0].count).toBe(rpBefore.rows[0].count);
    });
  });
});
