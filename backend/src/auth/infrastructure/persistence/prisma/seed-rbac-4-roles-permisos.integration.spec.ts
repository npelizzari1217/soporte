/**
 * T1.1, T1.3 [INT] — Integration: seed_rbac_4_roles_permisos (PR1) +
 * add_permiso_catalogo_gestionar (PR2, Fase 2 tickets-core) +
 * add_permiso_kb_gestionar (PR-K, Fase 4 premium).
 *
 * Verifica que la migración `20260805110000_seed_rbac_4_roles_permisos`
 * siembre correctamente los 4 roles (USUARIO/COLABORADOR/TECNICO/ADMINISTRADOR)
 * y los 19 permisos base, que la migración aditiva
 * `20260806120000_add_permiso_catalogo_gestionar` (PR2) agregue el permiso
 * 20 (`catalogo:gestionar`) exclusivo de ADMINISTRADOR, y que
 * `20260806170000_add_permiso_kb_gestionar` (PR-K, K4) agregue el permiso 21
 * (`kb:gestionar`) a TECNICO + ADMINISTRADOR — matriz acumulativa final:
 * USUARIO=2, COLABORADOR=7, TECNICO=15, ADMINISTRADOR=21. Las tres
 * migraciones son idempotentes (re-ejecutarlas no cambia row counts).
 *
 * Estrategia TDD:
 *   RED  → ANTES de crear migration.sql: beforeAll lanza ENOENT (archivo no existe).
 *   GREEN → DESPUÉS de crear migration.sql: beforeAll aplica el SQL y los tests pasan.
 *
 * Configuración de DB:
 *   - Usa DATABASE_URL_MASTER del entorno o el fallback local de test.
 *   - NUNCA apunta a soporte_master (DB de desarrollo).
 *   - Migraciones idempotentes (ON CONFLICT DO NOTHING) — seguras de re-aplicar.
 *
 * Ref spec: sdd/auth-multitenancy/spec §R1. Ref sdd/tickets-core/spec T2.
 * Ref sdd/premium/spec K4.
 * Ref design: sdd/auth-multitenancy/design ADR-1. Ref sdd/tickets-core/design ADR-2.
 * Ref sdd/premium/design ADR-P6.
 * Tareas: T1.1, T1.3 (Fase 1) + PR2 catalogo:gestionar (Fase 2) + PR-K
 * kb:gestionar (Fase 4, K9/K10, este sesión)
 */
import * as fs from 'fs';
import * as path from 'path';
import { Pool } from 'pg';

const TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

// El archivo que este test pone en RED/GREEN.
const MIGRATION_FILE = path.resolve(
  __dirname,
  '../../../../../prisma_master/migrations/20260805110000_seed_rbac_4_roles_permisos/migration.sql',
);

// PR2 (Fase 2 tickets-core) — permiso `catalogo:gestionar`, exclusivo ADMINISTRADOR.
const MIGRATION_FILE_CATALOGO = path.resolve(
  __dirname,
  '../../../../../prisma_master/migrations/20260806120000_add_permiso_catalogo_gestionar/migration.sql',
);

// PR-K (Fase 4 premium, K4/K9) — permiso `kb:gestionar`, TECNICO + ADMINISTRADOR.
const MIGRATION_FILE_KB = path.resolve(
  __dirname,
  '../../../../../prisma_master/migrations/20260806170000_add_permiso_kb_gestionar/migration.sql',
);

// ─── UUIDs autoritativos (migration.sql — comentario de cabecera) ────────────
const ROLE_UUIDS: Record<string, string> = {
  USUARIO: 'a0000000-0000-4000-a000-000000000001',
  COLABORADOR: 'a0000000-0000-4000-a000-000000000002',
  TECNICO: 'a0000000-0000-4000-a000-000000000003',
  ADMINISTRADOR: 'a0000000-0000-4000-a000-000000000004',
};

// ─── Matrices acumulativas por rol (spec R1, copiadas verbatim de soporte1) ──
const USUARIO_PERMISOS = ['ticket:crear', 'ticket:comentar'];

const COLABORADOR_PERMISOS = [
  ...USUARIO_PERMISOS,
  'ticket:ver_todos',
  'compra:gestionar',
  'compra:aprobar',
  'ticket:aprobar',
  'ticket:rechazar',
];

const TECNICO_PERMISOS_BASE = [
  ...COLABORADOR_PERMISOS,
  'ticket:editar',
  'ticket:transicionar',
  'ticket:observar',
  'ticket:asignar',
  'ticket:cerrar',
  'equipo:gestionar',
  'subtarea:actualizar',
];

// PR-K (Fase 4 premium, K4/ADR-P6): kb:gestionar se agrega a TECNICO (y a
// ADMINISTRADOR, ver abajo) vía migración aditiva separada — TECNICO pasa
// de 14 a 15 permisos.
const TECNICO_PERMISOS = [...TECNICO_PERMISOS_BASE, 'kb:gestionar'];

const ADMINISTRADOR_PERMISOS_BASE = [
  ...TECNICO_PERMISOS_BASE,
  'ticket:eliminar',
  'usuario:gestionar',
  'rol:asignar',
  'cliente:gestionar',
  'ciclo:gestionar',
];

// PR2 (Fase 2 tickets-core, ADR-2): catalogo:gestionar se agrega a ADMINISTRADOR
// vía migración aditiva separada — ADMINISTRADOR pasa de 19 a 20 permisos.
// PR-K (Fase 4 premium, K4): kb:gestionar se agrega a ADMINISTRADOR también
// (además de TECNICO) — ADMINISTRADOR pasa de 20 a 21 permisos.
const ADMINISTRADOR_PERMISOS = [
  ...ADMINISTRADOR_PERMISOS_BASE,
  'catalogo:gestionar',
  'kb:gestionar',
];

// ────────────────────────────────────────────────────────────────────────────

describe('Migration: seed_rbac_4_roles_permisos (integration — PR1)', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_URL });
    // RED si el archivo no existe (ENOENT), ANTES de tocar la DB. GREEN cuando exista.
    const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
    // Limpia roles/permisos/roles_permisos/membresias — esta suite corre en
    // `soporte_master_test` junto a otros specs de integración (PR5/PR6) que
    // insertan roles de fixture ad-hoc (mismos codigos, UUID random vía
    // gen_random_uuid()) sin dejar la tabla limpia al terminar. Sin este
    // TRUNCATE, `ON CONFLICT (codigo) DO NOTHING` de la migración deja
    // intactas esas filas de fixture y las aserciones de UUID determinista
    // fallan por datos ajenos a este test, no por un bug de la migración.
    await pool.query(
      'TRUNCATE TABLE membresias, roles_permisos, roles, permisos RESTART IDENTITY CASCADE',
    );
    await pool.query(sql);

    // PR2: aplica la migración aditiva de catalogo:gestionar sobre la misma
    // matriz base — RED si el archivo no existe (ENOENT), GREEN cuando exista.
    const sqlCatalogo = fs.readFileSync(MIGRATION_FILE_CATALOGO, 'utf8');
    await pool.query(sqlCatalogo);

    // PR-K: aplica la migración aditiva de kb:gestionar (TECNICO+ADMINISTRADOR)
    // — RED si el archivo no existe (ENOENT), GREEN cuando exista.
    const sqlKb = fs.readFileSync(MIGRATION_FILE_KB, 'utf8');
    await pool.query(sqlKb);
  });

  afterAll(async () => {
    await pool.end();
  });

  // ─── Helper ─────────────────────────────────────────────────────────────

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

  // ─── T1.1 — 4 roles existen con UUIDs deterministas ──────────────────────

  describe('T1.1 — 4 roles con UUIDs deterministas y deleted_at IS NULL', () => {
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

  // ─── 21 permisos sembrados (19 base + catalogo:gestionar PR2 + kb:gestionar PR-K) ──

  describe('21 permisos sembrados con deleted_at IS NULL (19 base + catalogo:gestionar PR2 + kb:gestionar PR-K)', () => {
    it('existen exactamente los 21 permisos de la matriz ADMINISTRADOR', async () => {
      const { rows } = await pool.query<{ codigo: string; deleted_at: string | null }>(
        'SELECT codigo, deleted_at FROM permisos WHERE codigo = ANY($1)',
        [ADMINISTRADOR_PERMISOS],
      );
      expect(rows).toHaveLength(21);
      for (const row of rows) expect(row.deleted_at).toBeNull();
    });
  });

  // ─── USUARIO: exactamente 2 permisos ─────────────────────────────────────

  describe('USUARIO: exactamente ticket:crear + ticket:comentar', () => {
    it('tiene exactamente 2 permisos y no recibe permisos de transición de estado', async () => {
      const permisos = await permisosDeRol('USUARIO');
      expect(permisos).toHaveLength(2);
      for (const p of USUARIO_PERMISOS) expect(permisos).toContain(p);
      expect(permisos).not.toContain('ticket:observar');
      expect(permisos).not.toContain('ticket:transicionar');
      expect(permisos).not.toContain('ticket:aprobar');
      expect(permisos).not.toContain('ticket:rechazar');
    });
  });

  // ─── COLABORADOR: 7 permisos ─────────────────────────────────────────────

  describe('COLABORADOR: acumula USUARIO + 5', () => {
    it('tiene exactamente 7 permisos incluyendo los de USUARIO; NO tiene ticket:observar ni ticket:editar', async () => {
      const permisos = await permisosDeRol('COLABORADOR');
      expect(permisos).toHaveLength(7);
      for (const p of COLABORADOR_PERMISOS) expect(permisos).toContain(p);
      expect(permisos).not.toContain('ticket:observar');
      expect(permisos).not.toContain('ticket:editar');
    });
  });

  // ─── TECNICO: 15 permisos (14 base + kb:gestionar PR-K) ────────────────────

  describe('TECNICO: acumula COLABORADOR + 7 + kb:gestionar (PR-K)', () => {
    it('tiene exactamente 15 permisos incluyendo ticket:transicionar, ticket:observar y kb:gestionar; NO tiene ticket:eliminar ni ciclo:gestionar', async () => {
      const permisos = await permisosDeRol('TECNICO');
      expect(permisos).toHaveLength(15);
      for (const p of TECNICO_PERMISOS) expect(permisos).toContain(p);
      expect(permisos).not.toContain('ticket:eliminar');
      expect(permisos).not.toContain('ciclo:gestionar');
    });
  });

  // ─── ADMINISTRADOR: 21 permisos (19 base + catalogo:gestionar PR2 + kb:gestionar PR-K) ──

  describe('ADMINISTRADOR: todos los 21 permisos (PR2 agrega catalogo:gestionar, PR-K agrega kb:gestionar)', () => {
    it('tiene exactamente 21 permisos incluyendo ticket:eliminar, usuario:gestionar, rol:asignar, cliente:gestionar, ciclo:gestionar, catalogo:gestionar, kb:gestionar', async () => {
      const permisos = await permisosDeRol('ADMINISTRADOR');
      expect(permisos).toHaveLength(21);
      for (const p of ADMINISTRADOR_PERMISOS) expect(permisos).toContain(p);
    });
  });

  // ─── PR2 (ADR-2): catalogo:gestionar es EXCLUSIVO de ADMINISTRADOR ────────

  describe('catalogo:gestionar (PR2): exclusivo de ADMINISTRADOR', () => {
    it('USUARIO, COLABORADOR y TECNICO NO tienen catalogo:gestionar', async () => {
      const [usuario, colaborador, tecnico] = await Promise.all([
        permisosDeRol('USUARIO'),
        permisosDeRol('COLABORADOR'),
        permisosDeRol('TECNICO'),
      ]);
      expect(usuario).not.toContain('catalogo:gestionar');
      expect(colaborador).not.toContain('catalogo:gestionar');
      expect(tecnico).not.toContain('catalogo:gestionar');
    });

    it('ADMINISTRADOR SÍ tiene catalogo:gestionar', async () => {
      const permisos = await permisosDeRol('ADMINISTRADOR');
      expect(permisos).toContain('catalogo:gestionar');
    });
  });

  // ─── K9/K10: kb:gestionar es de TECNICO + ADMINISTRADOR ────────────────────

  describe('kb:gestionar (PR-K, K4/ADR-P6): TECNICO + ADMINISTRADOR', () => {
    it('USUARIO y COLABORADOR NO tienen kb:gestionar', async () => {
      const [usuario, colaborador] = await Promise.all([
        permisosDeRol('USUARIO'),
        permisosDeRol('COLABORADOR'),
      ]);
      expect(usuario).not.toContain('kb:gestionar');
      expect(colaborador).not.toContain('kb:gestionar');
    });

    it('TECNICO y ADMINISTRADOR SÍ tienen kb:gestionar', async () => {
      const [tecnico, administrador] = await Promise.all([
        permisosDeRol('TECNICO'),
        permisosDeRol('ADMINISTRADOR'),
      ]);
      expect(tecnico).toContain('kb:gestionar');
      expect(administrador).toContain('kb:gestionar');
    });
  });

  // ─── Idempotencia ───────────────────────────────────────────────────────

  describe('idempotencia: 2ª ejecución no cambia row counts', () => {
    it('re-ejecutar ambas migraciones no modifica roles, permisos ni roles_permisos', async () => {
      const [rolesBefore, permisosBefore, rpBefore] = await Promise.all([
        pool.query<{ count: string }>('SELECT COUNT(*) FROM roles'),
        pool.query<{ count: string }>('SELECT COUNT(*) FROM permisos'),
        pool.query<{ count: string }>('SELECT COUNT(*) FROM roles_permisos'),
      ]);

      const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
      await pool.query(sql);
      const sqlCatalogo = fs.readFileSync(MIGRATION_FILE_CATALOGO, 'utf8');
      await pool.query(sqlCatalogo);
      const sqlKb = fs.readFileSync(MIGRATION_FILE_KB, 'utf8');
      await pool.query(sqlKb);

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

  // ─── T1.3 — Invariante: USUARIO no tiene permisos de transición de estado ─

  describe('T1.3 — invariante "solo TECNICO+ transiciona estado": USUARIO excluido', () => {
    it('USUARIO NO tiene ticket:observar, ticket:transicionar, ticket:aprobar ni ticket:rechazar', async () => {
      const permisos = await permisosDeRol('USUARIO');
      expect(permisos).not.toContain('ticket:observar');
      expect(permisos).not.toContain('ticket:transicionar');
      expect(permisos).not.toContain('ticket:aprobar');
      expect(permisos).not.toContain('ticket:rechazar');
    });
  });
});
