/**
 * T1.1–T1.9 TEST — Integration: seed_rbac_4_roles (PR1, Change B)
 *
 * Verifica que la migración 20260629100000_seed_rbac_4_roles siembre
 * correctamente los 4 roles nuevos (a0..006–009), 2 permisos nuevos
 * (b0..018–019) y la matriz acumulativa completa.
 *
 * Estrategia TDD:
 *   RED  → ANTES de crear migration.sql: beforeAll lanza ENOENT.
 *   GREEN → DESPUÉS de crear migration.sql: beforeAll aplica el SQL y los tests pasan.
 *
 * Configuración de DB:
 *   - Usa DATABASE_URL_MASTER del entorno o el fallback local de test.
 *   - NUNCA apunta a soporte_master (DB de desarrollo).
 *   - Aplica las migraciones de prerequisites (ticket_estados) + la nueva,
 *     todas idempotentes (ON CONFLICT DO NOTHING).
 *
 * Ref spec: specs/auth-rbac/spec.md §Catálogo de roles, §Catálogo de permisos, §Matriz rol→permisos
 * Ref design: ADR-1
 * Tareas: T1.1–T1.9 (RED) → T1.10–T1.11 (IMPL) → T1.12 (GREEN)
 */
import * as fs from 'fs';
import * as path from 'path';
import { Pool } from 'pg';

const TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

// Prerequisite: Change A — ticket:observar/transicionar/aprobar/rechazar (b0..014–017)
const PREREQ_MIGRATION_FILE = path.resolve(
  __dirname,
  '../../../../../prisma_master/migrations/20260629040000_seed_rbac_ticket_estados/migration.sql',
);

// El archivo que este test pone en RED/GREEN
const MIGRATION_FILE = path.resolve(
  __dirname,
  '../../../../../prisma_master/migrations/20260629100000_seed_rbac_4_roles/migration.sql',
);

// ─── UUIDs autoritativos (tasks.md §UUID Reference — override del spec) ─────────
const ROLE_UUIDS: Record<string, string> = {
  USUARIO: 'a0000000-0000-4000-a000-000000000006',
  COLABORADOR: 'a0000000-0000-4000-a000-000000000007',
  TECNICO: 'a0000000-0000-4000-a000-000000000008',
  ADMINISTRADOR: 'a0000000-0000-4000-a000-000000000009',
};

// ─── Matrices acumulativas por rol (tasks.md §Matriz acumulativa completa) ────────
const USUARIO_PERMISOS = ['ticket:crear', 'ticket:comentar'];

const COLABORADOR_PERMISOS = [
  ...USUARIO_PERMISOS,
  'ticket:ver_todos',
  'compra:gestionar',
  'compra:aprobar',
  'ticket:aprobar',
  'ticket:rechazar',
];

const TECNICO_PERMISOS = [
  ...COLABORADOR_PERMISOS,
  'ticket:editar',
  'ticket:transicionar',
  'ticket:observar',
  'ticket:asignar',
  'ticket:cerrar',
  'equipo:gestionar',
  'subtarea:actualizar',
];

const ADMINISTRADOR_PERMISOS = [
  ...TECNICO_PERMISOS,
  'ticket:eliminar',
  'usuario:gestionar',
  'rol:asignar',
  'cliente:gestionar',
  'ciclo:gestionar',
];

// ─────────────────────────────────────────────────────────────────────────────────
// Suite
// ─────────────────────────────────────────────────────────────────────────────────

describe('Migration: seed_rbac_4_roles (integration — PR1, Change B)', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_URL });
    // Prerequisite: semilla de ticket_estados (Change A — b0..014–017).
    // Idempotente — seguro aunque ya esté aplicada.
    const prereqSql = fs.readFileSync(PREREQ_MIGRATION_FILE, 'utf8');
    await pool.query(prereqSql);
    // La nueva migración. RED si el archivo no existe (ENOENT). GREEN cuando exista.
    const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
    await pool.query(sql);
  });

  afterAll(async () => {
    await pool.end();
  });

  // ─── Helper ─────────────────────────────────────────────────────────────────

  async function permisosDeRol(rol: string): Promise<string[]> {
    const { rows } = await pool.query<{ codigo: string }>(
      `SELECT p.codigo
       FROM roles_permisos rp
       JOIN roles    r ON r.id = rp.rol_id
       JOIN permisos p ON p.id = rp.permiso_id
       WHERE r.codigo = $1
       ORDER BY p.codigo`,
      [rol],
    );
    return rows.map((r) => r.codigo);
  }

  // ─── T1.1 — 4 nuevos roles existen con UUIDs a0..006–009 ─────────────────

  describe('T1.1 — 4 nuevos roles con UUIDs deterministas y deleted_at IS NULL', () => {
    it.each(Object.entries(ROLE_UUIDS))(
      '%s: existe con UUID %s y deleted_at IS NULL',
      async (codigo, uuid) => {
        const { rows } = await pool.query('SELECT id, deleted_at FROM roles WHERE codigo = $1', [
          codigo,
        ]);
        expect(rows).toHaveLength(1);
        expect(rows[0].id).toBe(uuid);
        expect(rows[0].deleted_at).toBeNull();
      },
    );
  });

  // ─── T1.2 — 2 permisos nuevos (b0..018–019) ──────────────────────────────

  describe('T1.2 — ciclo:gestionar (b0..018) y ticket:comentar (b0..019)', () => {
    it('ciclo:gestionar existe con UUID b0000000-0000-4000-b000-000000000018 y deleted_at IS NULL', async () => {
      const { rows } = await pool.query(
        "SELECT id, deleted_at FROM permisos WHERE codigo = 'ciclo:gestionar'",
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe('b0000000-0000-4000-b000-000000000018');
      expect(rows[0].deleted_at).toBeNull();
    });

    it('ticket:comentar existe con UUID b0000000-0000-4000-b000-000000000019 y deleted_at IS NULL', async () => {
      const { rows } = await pool.query(
        "SELECT id, deleted_at FROM permisos WHERE codigo = 'ticket:comentar'",
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe('b0000000-0000-4000-b000-000000000019');
      expect(rows[0].deleted_at).toBeNull();
    });
  });

  // ─── T1.3 — USUARIO: exactamente 2 permisos ──────────────────────────────

  describe('T1.3 — USUARIO: exactamente ticket:crear + ticket:comentar', () => {
    it('tiene exactamente 2 permisos y no recibe ticket:observar ni ticket:aprobar/rechazar', async () => {
      const permisos = await permisosDeRol('USUARIO');
      expect(permisos).toHaveLength(2);
      for (const p of USUARIO_PERMISOS) expect(permisos).toContain(p);
      expect(permisos).not.toContain('ticket:observar');
      expect(permisos).not.toContain('ticket:transicionar');
      expect(permisos).not.toContain('ticket:aprobar');
      expect(permisos).not.toContain('ticket:rechazar');
    });
  });

  // ─── T1.4 — COLABORADOR: 7 permisos ──────────────────────────────────────

  describe('T1.4 — COLABORADOR: acumula USUARIO + 5', () => {
    it('tiene exactamente 7 permisos incluyendo los de USUARIO; NO tiene ticket:observar ni ticket:editar', async () => {
      const permisos = await permisosDeRol('COLABORADOR');
      expect(permisos).toHaveLength(7);
      for (const p of COLABORADOR_PERMISOS) expect(permisos).toContain(p);
      expect(permisos).not.toContain('ticket:observar');
      expect(permisos).not.toContain('ticket:editar');
    });
  });

  // ─── T1.5 — TECNICO: 14 permisos ─────────────────────────────────────────

  describe('T1.5 — TECNICO: acumula COLABORADOR + 7', () => {
    it('tiene exactamente 14 permisos incluyendo ticket:transicionar y ticket:observar; NO tiene ticket:eliminar ni ciclo:gestionar', async () => {
      const permisos = await permisosDeRol('TECNICO');
      expect(permisos).toHaveLength(14);
      for (const p of TECNICO_PERMISOS) expect(permisos).toContain(p);
      expect(permisos).not.toContain('ticket:eliminar');
      expect(permisos).not.toContain('ciclo:gestionar');
    });
  });

  // ─── T1.6 — ADMINISTRADOR: 19 permisos ───────────────────────────────────

  describe('T1.6 — ADMINISTRADOR: todos los 19 permisos', () => {
    it('tiene exactamente 19 permisos incluyendo ticket:eliminar, usuario:gestionar, rol:asignar, cliente:gestionar, ciclo:gestionar', async () => {
      const permisos = await permisosDeRol('ADMINISTRADOR');
      expect(permisos).toHaveLength(19);
      for (const p of ADMINISTRADOR_PERMISOS) expect(permisos).toContain(p);
    });
  });

  // ─── T1.7 — Idempotencia ──────────────────────────────────────────────────

  describe('T1.7 — idempotencia: 2ª ejecución no cambia row counts', () => {
    it('re-ejecutar la migración no modifica roles, permisos ni roles_permisos', async () => {
      const [rolesBefore, permisosBefore, rpBefore] = await Promise.all([
        pool.query<{ count: string }>('SELECT COUNT(*) FROM roles'),
        pool.query<{ count: string }>('SELECT COUNT(*) FROM permisos'),
        pool.query<{ count: string }>('SELECT COUNT(*) FROM roles_permisos'),
      ]);

      const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
      await pool.query(sql);

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

  // ─── T1.8 — Contrato Change A: UUIDs exactos en TECNICO ──────────────────

  describe('T1.8 — contrato Change A: TECNICO tiene ticket:observar (b0..014) y ticket:transicionar (b0..015) exactos', () => {
    it('TECNICO tiene asociación con permiso_id = b0000000-0000-4000-b000-000000000014 (ticket:observar)', async () => {
      const { rows } = await pool.query(
        `SELECT rp.permiso_id
         FROM roles_permisos rp
         JOIN roles r ON r.id = rp.rol_id
         WHERE r.codigo = 'TECNICO'
           AND rp.permiso_id = 'b0000000-0000-4000-b000-000000000014'`,
      );
      expect(rows).toHaveLength(1);
    });

    it('TECNICO tiene asociación con permiso_id = b0000000-0000-4000-b000-000000000015 (ticket:transicionar)', async () => {
      const { rows } = await pool.query(
        `SELECT rp.permiso_id
         FROM roles_permisos rp
         JOIN roles r ON r.id = rp.rol_id
         WHERE r.codigo = 'TECNICO'
           AND rp.permiso_id = 'b0000000-0000-4000-b000-000000000015'`,
      );
      expect(rows).toHaveLength(1);
    });
  });

  // ─── T1.9 — Invariante: USUARIO no tiene permisos de transición de estado ─

  describe('T1.9 — invariante "solo Técnico cambia estado": USUARIO excluido', () => {
    it('USUARIO NO tiene ticket:observar, ticket:transicionar, ticket:aprobar ni ticket:rechazar', async () => {
      const permisos = await permisosDeRol('USUARIO');
      expect(permisos).not.toContain('ticket:observar');
      expect(permisos).not.toContain('ticket:transicionar');
      expect(permisos).not.toContain('ticket:aprobar');
      expect(permisos).not.toContain('ticket:rechazar');
    });
  });
});
