/**
 * T1.1, T1.3 [INT] — Integration: seed_rbac_4_roles_permisos (PR1) +
 * add_permiso_catalogo_gestionar (PR2, Fase 2 tickets-core) +
 * add_permiso_kb_gestionar (PR-K, Fase 4 premium) +
 * remove_permiso_compra_de_tecnico (PR-3, redisenio-modulo-compras).
 *
 * Verifica que la migración `20260805110000_seed_rbac_4_roles_permisos`
 * siembre correctamente los 4 roles (USUARIO/COLABORADOR/TECNICO/ADMINISTRADOR)
 * y los 19 permisos base, que la migración aditiva
 * `20260806120000_add_permiso_catalogo_gestionar` (PR2) agregue el permiso
 * 20 (`catalogo:gestionar`) exclusivo de ADMINISTRADOR, que
 * `20260806170000_add_permiso_kb_gestionar` (PR-K, K4) agregue el permiso 21
 * (`kb:gestionar`) a TECNICO + ADMINISTRADOR, y que la migración aditiva
 * `20260813130000_remove_permiso_compra_de_tecnico` (PR-3) le quite a
 * TECNICO las asignaciones de `compra:gestionar`/`compra:aprobar` en
 * `roles_permisos` (SIN borrar las filas de `permisos`, que siguen siendo
 * usadas por COLABORADOR y ADMINISTRADOR) — matriz acumulativa final:
 * USUARIO=2, COLABORADOR=7, TECNICO=13, ADMINISTRADOR=21. Las cuatro
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
 * DB EFÍMERA (fix schema-drift, sdd/converger-schema-master-con-produccion):
 * `roles_permisos`/`permisos` ya NO existen en `soporte_master_test` una vez
 * aplicada la migración `20260817180000_drop_legacy_rbac_tablas_muertas`
 * (converge el schema con el DROP que WU-9 ya había corrido en producción vía
 * script standalone). Este archivo prueba una migración HISTÓRICA que crea
 * esas tablas — no puede correr contra la DB compartida (que ya las dropeó
 * si corrió el `migrate deploy` completo). Se crea una DB efímera propia y se
 * reproduce el schema SOLO hasta justo antes del DROP (`init_master`), mismo
 * patrón que `rollback-compras-tres-etapas.integration.spec.ts` en el lado
 * tenant.
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
import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { PostgresAdminService } from '../../../../clientes/infrastructure/postgres-admin.service';

const TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const MASTER_MIGRATIONS_DIR = path.resolve(__dirname, '../../../../../prisma_master/migrations');
// Última carpeta que este spec necesita reproducir ANTES de las 4 migraciones
// bajo test — cualquier carpeta posterior (incl. el DROP) queda AFUERA.
const ULTIMA_CARPETA_PREVIA = '20260805105221_init_master';
const EPHEMERAL_DB_NAME = `soporte_seed_rbac_${randomBytes(4).toString('hex')}_test`;

/** Corre, en orden, los `migration.sql` con carpeta <= `ULTIMA_CARPETA_PREVIA`. */
async function reproducirSchemaPrevio(pool: InstanceType<typeof Pool>): Promise<void> {
  const carpetas = fs
    .readdirSync(MASTER_MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entrada) => entrada.isDirectory())
    .map((entrada) => entrada.name)
    .filter((nombre) => nombre <= ULTIMA_CARPETA_PREVIA)
    .sort();

  for (const carpeta of carpetas) {
    const sql = fs.readFileSync(path.join(MASTER_MIGRATIONS_DIR, carpeta, 'migration.sql'), 'utf8');
    await pool.query(sql);
  }
}

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

// PR-3 (redisenio-modulo-compras) — quita a TECNICO las asignaciones de
// compra:gestionar/compra:aprobar en roles_permisos. Aditiva: NO borra filas
// de `permisos` (las siguen usando COLABORADOR y ADMINISTRADOR).
const MIGRATION_FILE_COMPRA_TECNICO = path.resolve(
  __dirname,
  '../../../../../prisma_master/migrations/20260813130000_remove_permiso_compra_de_tecnico/migration.sql',
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

// PR-3 (redisenio-modulo-compras): TECNICO deja de gestionar/aprobar compras
// (S38/S39 de la spec — 403 en ambos). Como COLABORADOR_PERMISOS incluye
// compra:gestionar/compra:aprobar y TECNICO_PERMISOS_BASE los heredaba vía
// spread, se filtran EXPLÍCITAMENTE acá: TECNICO pasa de 14 a 12 permisos
// base (15→13 con kb:gestionar). ADMINISTRADOR los recupera explícitamente
// más abajo para no perderlos en cascada (ver ADMINISTRADOR_PERMISOS_BASE).
//
// ROMPE LA JERARQUÍA ACUMULATIVA A PROPÓSITO: COLABORADOR queda pudiendo
// aprobar compras que TECNICO, su superior, tiene prohibidas. El spec §4.11
// no se pronunció sobre COLABORADOR; el hueco se elevó al maintainer el
// 2026-08-13 y la decisión fue COLABORADOR sí / TECNICO y USUARIO no.
// Este `filter` es la decisión, no un descuido — ver el bloque de la
// migración `20260813130000_remove_permiso_compra_de_tecnico` antes de
// tocarlo.
const TECNICO_PERMISOS_BASE = [
  ...COLABORADOR_PERMISOS.filter((p) => p !== 'compra:gestionar' && p !== 'compra:aprobar'),
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

// ADMINISTRADOR retiene compra:gestionar/compra:aprobar (PR-3: ya no forman
// parte de TECNICO_PERMISOS_BASE, así que se re-agregan explícitamente para
// que la cascada no se los lleve puestos). Total sin cambios: 19.
const ADMINISTRADOR_PERMISOS_BASE = [
  ...TECNICO_PERMISOS_BASE,
  'compra:gestionar',
  'compra:aprobar',
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
  const admin = new PostgresAdminService(TEST_URL);

  beforeAll(async () => {
    await admin.createDatabase(EPHEMERAL_DB_NAME);
    const ephemeralUrl = new URL(TEST_URL);
    ephemeralUrl.pathname = `/${EPHEMERAL_DB_NAME}`;
    pool = new Pool({ connectionString: ephemeralUrl.toString() });

    // Reproduce el schema justo antes de las 4 migraciones bajo test — DB
    // efímera y recién creada, así que no hace falta TRUNCATE previo (a
    // diferencia de la versión vieja de este spec, que compartía
    // `soporte_master_test` con otros specs de integración).
    await reproducirSchemaPrevio(pool);

    // RED si el archivo no existe (ENOENT), GREEN cuando exista.
    const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
    await pool.query(sql);

    // PR2: aplica la migración aditiva de catalogo:gestionar sobre la misma
    // matriz base — RED si el archivo no existe (ENOENT), GREEN cuando exista.
    const sqlCatalogo = fs.readFileSync(MIGRATION_FILE_CATALOGO, 'utf8');
    await pool.query(sqlCatalogo);

    // PR-K: aplica la migración aditiva de kb:gestionar (TECNICO+ADMINISTRADOR)
    // — RED si el archivo no existe (ENOENT), GREEN cuando exista.
    const sqlKb = fs.readFileSync(MIGRATION_FILE_KB, 'utf8');
    await pool.query(sqlKb);

    // PR-3: aplica la migración aditiva que le quita a TECNICO
    // compra:gestionar/compra:aprobar — RED si el archivo no existe (ENOENT),
    // GREEN cuando exista.
    const sqlCompraTecnico = fs.readFileSync(MIGRATION_FILE_COMPRA_TECNICO, 'utf8');
    await pool.query(sqlCompraTecnico);
  }, 60_000);

  afterAll(async () => {
    await pool.end().catch(() => undefined);
    await admin.dropDatabase(EPHEMERAL_DB_NAME);
  }, 30_000);

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

  // ─── TECNICO: 13 permisos (12 base + kb:gestionar PR-K; PR-3 le quita compra:gestionar/aprobar) ──

  describe('TECNICO: acumula COLABORADOR - compras + 7 + kb:gestionar (PR-K)', () => {
    it('tiene exactamente 13 permisos incluyendo ticket:transicionar, ticket:observar y kb:gestionar; NO tiene ticket:eliminar, ciclo:gestionar, compra:gestionar ni compra:aprobar', async () => {
      const permisos = await permisosDeRol('TECNICO');
      expect(permisos).toHaveLength(13);
      for (const p of TECNICO_PERMISOS) expect(permisos).toContain(p);
      expect(permisos).not.toContain('ticket:eliminar');
      expect(permisos).not.toContain('ciclo:gestionar');
      expect(permisos).not.toContain('compra:gestionar');
      expect(permisos).not.toContain('compra:aprobar');
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
    it('re-ejecutar las cuatro migraciones no modifica roles, permisos ni roles_permisos', async () => {
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
      const sqlCompraTecnico = fs.readFileSync(MIGRATION_FILE_COMPRA_TECNICO, 'utf8');
      await pool.query(sqlCompraTecnico);

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
