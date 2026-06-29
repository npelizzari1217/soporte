/**
 * T2.1–T2.8 TEST — Integration: remap_usuarios_roles (PR2, Change B)
 *
 * Verifica que la migración 20260629110000_remap_usuarios_roles:
 *   - Remapea cada usuario con rol legacy al rol nuevo equivalente
 *   - Colapsa SOPORTE_IT + MANTENIMIENTO → un solo TECNICO (ON CONFLICT DO NOTHING)
 *   - Elimina filas legacy de usuarios_roles
 *   - Soft-deletes los 5 roles legacy (deleted_at = now())
 *   - Es idempotente (segunda ejecución no cambia row counts ni timestamps)
 *
 * Estrategia TDD:
 *   RED  → ANTES de crear migration.sql: beforeAll lanza ENOENT.
 *   GREEN → DESPUÉS de crear migration.sql: todos los tests pasan.
 *
 * Fixture setup: insertamos un cliente y 6 usuarios de prueba con roles legacy
 * antes de aplicar la migración. Se limpian en afterAll.
 *
 * Ref spec: specs/auth-rbac/spec.md §Migración de usuarios_roles
 * Ref design: ADR-3
 * Tareas: T2.1–T2.8 (RED) → T2.9–T2.11 (IMPL) → T2.12 (GREEN)
 */
import * as fs from 'fs';
import * as path from 'path';
import { Pool } from 'pg';

const TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

// Prerequisite migrations (idempotentes — seguras de aplicar aunque ya estén en la DB)
const PREREQ_FILES = [
  path.resolve(
    __dirname,
    '../../../../../prisma_master/migrations/20260629040000_seed_rbac_ticket_estados/migration.sql',
  ),
  path.resolve(
    __dirname,
    '../../../../../prisma_master/migrations/20260629100000_seed_rbac_4_roles/migration.sql',
  ),
];

// El archivo que este test pone en RED/GREEN
const MIGRATION_FILE = path.resolve(
  __dirname,
  '../../../../../prisma_master/migrations/20260629110000_remap_usuarios_roles/migration.sql',
);

// ─── UUIDs de fixture ─────────────────────────────────────────────────────────
// Prefijos d0/e0 — sin colisión con roles (a0), permisos (b0) ni tablas tenant.
const TEST_CLIENT_ID = 'd0000000-0000-4000-d000-000000000001';

type TestUser = {
  id: string;
  email: string;
  legacyRoles: string[];
};

const TEST_USERS: Record<string, TestUser> = {
  admin: {
    id: 'e0000000-0000-4000-e000-000000000001',
    email: 'pr2-admin@test.local',
    legacyRoles: ['ADMIN'],
  },
  solicitante: {
    id: 'e0000000-0000-4000-e000-000000000002',
    email: 'pr2-solicitante@test.local',
    legacyRoles: ['SOLICITANTE'],
  },
  soporteIt: {
    id: 'e0000000-0000-4000-e000-000000000003',
    email: 'pr2-soporte-it@test.local',
    legacyRoles: ['SOPORTE_IT'],
  },
  mantenimiento: {
    id: 'e0000000-0000-4000-e000-000000000004',
    email: 'pr2-mantenimiento@test.local',
    legacyRoles: ['MANTENIMIENTO'],
  },
  both: {
    id: 'e0000000-0000-4000-e000-000000000005',
    email: 'pr2-both@test.local',
    legacyRoles: ['SOPORTE_IT', 'MANTENIMIENTO'],
  },
  aprobador: {
    id: 'e0000000-0000-4000-e000-000000000006',
    email: 'pr2-aprobador@test.local',
    legacyRoles: ['APROBADOR_COMPRAS'],
  },
};

const TEST_USER_IDS = Object.values(TEST_USERS).map((u) => u.id);

const LEGACY_CODES = ['ADMIN', 'SOPORTE_IT', 'MANTENIMIENTO', 'APROBADOR_COMPRAS', 'SOLICITANTE'];
const NEW_CODES = ['USUARIO', 'COLABORADOR', 'TECNICO', 'ADMINISTRADOR'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function rolesDeUsuario(pool: Pool, userId: string): Promise<string[]> {
  const { rows } = await pool.query<{ codigo: string }>(
    `SELECT r.codigo
     FROM usuarios_roles ur
     JOIN roles r ON r.id = ur.rol_id
     WHERE ur.usuario_id = $1
     ORDER BY r.codigo`,
    [userId],
  );
  return rows.map((r) => r.codigo);
}

async function permisosDeUsuario(pool: Pool, userId: string): Promise<string[]> {
  const { rows } = await pool.query<{ codigo: string }>(
    `SELECT DISTINCT p.codigo
     FROM usuarios_roles ur
     JOIN roles r ON r.id = ur.rol_id
     JOIN roles_permisos rp ON rp.rol_id = r.id
     JOIN permisos p ON p.id = rp.permiso_id
     WHERE ur.usuario_id = $1
     ORDER BY p.codigo`,
    [userId],
  );
  return rows.map((r) => r.codigo);
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite
// ─────────────────────────────────────────────────────────────────────────────

describe('Migration: remap_usuarios_roles (integration — PR2, Change B)', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_URL });

    // 1. Aplicar prerequisitos (idempotente — seguro aunque ya estén en la DB)
    for (const filePath of PREREQ_FILES) {
      const sql = fs.readFileSync(filePath, 'utf8');
      await pool.query(sql);
    }

    // 2. Insertar fixture: cliente de prueba
    await pool.query(
      `INSERT INTO clientes (id, nombre, db_name)
       VALUES ($1, 'Test Client PR2', 'soporte_test_pr2_remap')
       ON CONFLICT DO NOTHING`,
      [TEST_CLIENT_ID],
    );

    // 3. Insertar fixture: usuarios de prueba
    for (const user of Object.values(TEST_USERS)) {
      await pool.query(
        `INSERT INTO usuarios (id, email, nombre, apellido, password_hash, cliente_id)
         VALUES ($1, $2, 'Test', 'PR2', 'hash-pr2', $3)
         ON CONFLICT (id) DO NOTHING`,
        [user.id, user.email, TEST_CLIENT_ID],
      );
    }

    // 4. Asignar roles legacy a los usuarios de prueba
    for (const user of Object.values(TEST_USERS)) {
      for (const rolCodigo of user.legacyRoles) {
        await pool.query(
          `INSERT INTO usuarios_roles (usuario_id, rol_id)
           SELECT $1, r.id FROM roles r WHERE r.codigo = $2
           ON CONFLICT (usuario_id, rol_id) DO NOTHING`,
          [user.id, rolCodigo],
        );
      }
    }

    // 5. Aplicar la migración PR2 — RED si el archivo no existe (ENOENT), GREEN cuando exista.
    const migrationSql = fs.readFileSync(MIGRATION_FILE, 'utf8');
    await pool.query(migrationSql);
  });

  afterAll(async () => {
    if (!pool) return;

    // Limpiar fixtures en orden inverso de FK
    const placeholders = TEST_USER_IDS.map((_, i) => `$${i + 1}`).join(', ');
    await pool.query(
      `DELETE FROM usuarios_roles WHERE usuario_id IN (${placeholders})`,
      TEST_USER_IDS,
    );
    await pool.query(
      `DELETE FROM refresh_tokens WHERE usuario_id IN (${placeholders})`,
      TEST_USER_IDS,
    );
    await pool.query(`DELETE FROM usuarios WHERE id IN (${placeholders})`, TEST_USER_IDS);
    await pool.query('DELETE FROM clientes WHERE id = $1', [TEST_CLIENT_ID]);

    await pool.end();
  });

  // ─── T2.1 — ADMIN → ADMINISTRADOR ────────────────────────────────────────

  describe('T2.1 — usuario con ADMIN migra a ADMINISTRADOR', () => {
    it('tiene rol ADMINISTRADOR y ya no tiene ADMIN en usuarios_roles', async () => {
      const roles = await rolesDeUsuario(pool, TEST_USERS.admin.id);
      expect(roles).toContain('ADMINISTRADOR');
      expect(roles).not.toContain('ADMIN');
    });
  });

  // ─── T2.2 — SOLICITANTE → USUARIO ────────────────────────────────────────

  describe('T2.2 — usuario con SOLICITANTE migra a USUARIO', () => {
    it('tiene rol USUARIO (a0..006) y ya no tiene SOLICITANTE', async () => {
      const roles = await rolesDeUsuario(pool, TEST_USERS.solicitante.id);
      expect(roles).toContain('USUARIO');
      expect(roles).not.toContain('SOLICITANTE');
    });
  });

  // ─── T2.3 — SOPORTE_IT/MANTENIMIENTO → TECNICO (double-role collapse) ───

  describe('T2.3 — SOPORTE_IT/MANTENIMIENTO → TECNICO (colapso doble-rol)', () => {
    it('usuario con solo SOPORTE_IT → TECNICO', async () => {
      const roles = await rolesDeUsuario(pool, TEST_USERS.soporteIt.id);
      expect(roles).toContain('TECNICO');
      expect(roles).not.toContain('SOPORTE_IT');
    });

    it('usuario con solo MANTENIMIENTO → TECNICO', async () => {
      const roles = await rolesDeUsuario(pool, TEST_USERS.mantenimiento.id);
      expect(roles).toContain('TECNICO');
      expect(roles).not.toContain('MANTENIMIENTO');
    });

    it('usuario con AMBOS (SOPORTE_IT + MANTENIMIENTO) colapsa a UNA sola fila TECNICO — sin duplicados', async () => {
      const roles = await rolesDeUsuario(pool, TEST_USERS.both.id);
      expect(roles).toHaveLength(1);
      expect(roles[0]).toBe('TECNICO');
    });
  });

  // ─── T2.4 — APROBADOR_COMPRAS → COLABORADOR ──────────────────────────────

  describe('T2.4 — usuario con APROBADOR_COMPRAS migra a COLABORADOR', () => {
    it('tiene rol COLABORADOR (a0..007) y ya no tiene APROBADOR_COMPRAS', async () => {
      const roles = await rolesDeUsuario(pool, TEST_USERS.aprobador.id);
      expect(roles).toContain('COLABORADOR');
      expect(roles).not.toContain('APROBADOR_COMPRAS');
    });
  });

  // ─── T2.5 — Ningún usuario tiene rows legacy en usuarios_roles ────────────

  describe('T2.5 — ningún usuario tiene filas legacy en usuarios_roles tras la migración', () => {
    it('COUNT de filas con roles legacy (ADMIN/SOPORTE_IT/MANTENIMIENTO/APROBADOR_COMPRAS/SOLICITANTE) = 0', async () => {
      const { rows } = await pool.query<{ count: string }>(
        `SELECT COUNT(*) AS count
         FROM usuarios_roles ur
         JOIN roles r ON r.id = ur.rol_id
         WHERE r.codigo = ANY($1)`,
        [LEGACY_CODES],
      );
      expect(parseInt(rows[0].count, 10)).toBe(0);
    });
  });

  // ─── T2.6 — Roles legacy soft-deleted; nuevos activos ─────────────────────

  describe('T2.6 — roles legacy tienen deleted_at IS NOT NULL; nuevos tienen NULL', () => {
    it.each(LEGACY_CODES)(
      'rol legacy %s: deleted_at IS NOT NULL (soft-deleted)',
      async (codigo) => {
        const { rows } = await pool.query<{ deleted_at: string | null }>(
          'SELECT deleted_at FROM roles WHERE codigo = $1',
          [codigo],
        );
        expect(rows).toHaveLength(1);
        expect(rows[0].deleted_at).not.toBeNull();
      },
    );

    it.each(NEW_CODES)('rol nuevo %s: deleted_at IS NULL (activo)', async (codigo) => {
      const { rows } = await pool.query<{ deleted_at: string | null }>(
        'SELECT deleted_at FROM roles WHERE codigo = $1',
        [codigo],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].deleted_at).toBeNull();
    });
  });

  // ─── T2.7 — Idempotencia ──────────────────────────────────────────────────

  describe('T2.7 — idempotencia: segunda ejecución no modifica row counts ni deleted_at', () => {
    it('re-ejecutar la migración no cambia row counts en usuarios_roles ni timestamps de legacy roles', async () => {
      const [urBefore, legacyBefore] = await Promise.all([
        pool.query<{ count: string }>('SELECT COUNT(*) AS count FROM usuarios_roles'),
        pool.query<{ codigo: string; deleted_at: Date }>(
          'SELECT codigo, deleted_at FROM roles WHERE codigo = ANY($1) ORDER BY codigo',
          [LEGACY_CODES],
        ),
      ]);

      const migrationSql = fs.readFileSync(MIGRATION_FILE, 'utf8');
      await pool.query(migrationSql);

      const [urAfter, legacyAfter] = await Promise.all([
        pool.query<{ count: string }>('SELECT COUNT(*) AS count FROM usuarios_roles'),
        pool.query<{ codigo: string; deleted_at: Date }>(
          'SELECT codigo, deleted_at FROM roles WHERE codigo = ANY($1) ORDER BY codigo',
          [LEGACY_CODES],
        ),
      ]);

      // Row count en usuarios_roles no cambia
      expect(urAfter.rows[0].count).toBe(urBefore.rows[0].count);

      // deleted_at de roles legacy no se sobreescribe (AND deleted_at IS NULL guard)
      for (let i = 0; i < legacyBefore.rows.length; i++) {
        expect(legacyAfter.rows[i].deleted_at).toEqual(legacyBefore.rows[i].deleted_at);
      }
    });
  });

  // ─── T2.8 — Usuario migrado conserva capacidades operativas ──────────────

  describe('T2.8 — usuario migrado (ex-APROBADOR_COMPRAS → COLABORADOR) conserva capacidades', () => {
    it('tiene permiso ticket:aprobar vía COLABORADOR; NO tiene ticket:observar (exclusivo TECNICO)', async () => {
      const permisos = await permisosDeUsuario(pool, TEST_USERS.aprobador.id);
      expect(permisos).toContain('ticket:aprobar');
      expect(permisos).not.toContain('ticket:observar');
    });
  });
});
