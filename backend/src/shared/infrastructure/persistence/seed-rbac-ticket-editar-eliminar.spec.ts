/**
 * S1-T1 TEST — Integration: migración master seed_rbac_ticket_editar_eliminar
 *
 * RED → antes de S1-T2 (migration.sql no existe → falla con ENOENT).
 * GREEN → después de crear la migration.sql con los INSERTs correctos.
 *
 * Estrategia: lee el archivo SQL de la migración y lo aplica sobre la DB master de test.
 * Verifica que los permisos y roles_permisos queden sembrados según la spec auth-rbac.
 *
 * DB de test: DATABASE_URL_MASTER o fallback local soporte_master_test.
 * No requiere TRUNCATE: usa ON CONFLICT DO NOTHING (idempotente).
 *
 * Ref spec: [SPEC:auth-rbac/Permisos sembrados, UUID determinista, Rol ADMIN, Rol SOPORTE_IT,
 *            Re-ejecución no duplica]
 * Tarea: S1-T1 (tickets-editar-borrar)
 */
import * as fs from 'fs';
import * as path from 'path';
import { Pool } from 'pg';

const TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const MIGRATION_FILE = path.resolve(
  __dirname,
  '../../../../prisma_master/migrations/20260627000000_seed_rbac_ticket_editar_eliminar/migration.sql',
);

describe('Migration: seed_rbac_ticket_editar_eliminar (master)', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_URL });
    // Aplica la migración. RED si el archivo no existe.
    const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
    await pool.query(sql);
  });

  afterAll(async () => {
    await pool.end();
  });

  // ─── Permisos sembrados ────────────────────────────────────────────────────

  describe('permisos sembrados con UUIDs deterministas', () => {
    it("ticket:editar existe con id 'b0000000-0000-4000-b000-000000000012'", async () => {
      const { rows } = await pool.query("SELECT id FROM permisos WHERE codigo = 'ticket:editar'");
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe('b0000000-0000-4000-b000-000000000012');
    });

    it("ticket:eliminar existe con id 'b0000000-0000-4000-b000-000000000013'", async () => {
      const { rows } = await pool.query("SELECT id FROM permisos WHERE codigo = 'ticket:eliminar'");
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe('b0000000-0000-4000-b000-000000000013');
    });
  });

  // ─── roles_permisos — asignación correcta ─────────────────────────────────

  describe('roles_permisos — ADMIN', () => {
    it('ADMIN tiene ticket:editar', async () => {
      const { rows } = await pool.query(`
        SELECT rp.rol_id FROM roles_permisos rp
        JOIN roles r ON r.id = rp.rol_id
        JOIN permisos p ON p.id = rp.permiso_id
        WHERE r.codigo = 'ADMIN' AND p.codigo = 'ticket:editar'
      `);
      expect(rows).toHaveLength(1);
    });

    it('ADMIN tiene ticket:eliminar', async () => {
      const { rows } = await pool.query(`
        SELECT rp.rol_id FROM roles_permisos rp
        JOIN roles r ON r.id = rp.rol_id
        JOIN permisos p ON p.id = rp.permiso_id
        WHERE r.codigo = 'ADMIN' AND p.codigo = 'ticket:eliminar'
      `);
      expect(rows).toHaveLength(1);
    });
  });

  describe('roles_permisos — SOPORTE_IT', () => {
    it('SOPORTE_IT tiene ticket:editar', async () => {
      const { rows } = await pool.query(`
        SELECT rp.rol_id FROM roles_permisos rp
        JOIN roles r ON r.id = rp.rol_id
        JOIN permisos p ON p.id = rp.permiso_id
        WHERE r.codigo = 'SOPORTE_IT' AND p.codigo = 'ticket:editar'
      `);
      expect(rows).toHaveLength(1);
    });

    it('SOPORTE_IT NO tiene ticket:eliminar', async () => {
      const { rows } = await pool.query(`
        SELECT rp.rol_id FROM roles_permisos rp
        JOIN roles r ON r.id = rp.rol_id
        JOIN permisos p ON p.id = rp.permiso_id
        WHERE r.codigo = 'SOPORTE_IT' AND p.codigo = 'ticket:eliminar'
      `);
      expect(rows).toHaveLength(0);
    });
  });

  describe('roles_permisos — otros roles sin los nuevos permisos', () => {
    it('MANTENIMIENTO no tiene ticket:editar ni ticket:eliminar', async () => {
      const { rows } = await pool.query(`
        SELECT rp.rol_id FROM roles_permisos rp
        JOIN roles r ON r.id = rp.rol_id
        JOIN permisos p ON p.id = rp.permiso_id
        WHERE r.codigo = 'MANTENIMIENTO'
          AND p.codigo IN ('ticket:editar', 'ticket:eliminar')
      `);
      expect(rows).toHaveLength(0);
    });

    it('APROBADOR_COMPRAS no tiene ticket:editar ni ticket:eliminar', async () => {
      const { rows } = await pool.query(`
        SELECT rp.rol_id FROM roles_permisos rp
        JOIN roles r ON r.id = rp.rol_id
        JOIN permisos p ON p.id = rp.permiso_id
        WHERE r.codigo = 'APROBADOR_COMPRAS'
          AND p.codigo IN ('ticket:editar', 'ticket:eliminar')
      `);
      expect(rows).toHaveLength(0);
    });

    it('SOLICITANTE no tiene ticket:editar ni ticket:eliminar', async () => {
      const { rows } = await pool.query(`
        SELECT rp.rol_id FROM roles_permisos rp
        JOIN roles r ON r.id = rp.rol_id
        JOIN permisos p ON p.id = rp.permiso_id
        WHERE r.codigo = 'SOLICITANTE'
          AND p.codigo IN ('ticket:editar', 'ticket:eliminar')
      `);
      expect(rows).toHaveLength(0);
    });
  });

  // ─── Idempotencia ─────────────────────────────────────────────────────────

  describe('idempotencia — 2ª ejecución sin error ni duplicados', () => {
    it('re-ejecutar la migración no lanza error', async () => {
      const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
      await expect(pool.query(sql)).resolves.not.toThrow();
    });

    it('no duplica permisos tras 2ª ejecución', async () => {
      const { rows } = await pool.query(
        "SELECT codigo FROM permisos WHERE codigo IN ('ticket:editar', 'ticket:eliminar') ORDER BY codigo",
      );
      expect(rows).toHaveLength(2);
    });

    it('no duplica roles_permisos en ADMIN+SOPORTE_IT tras 2ª ejecución (ADMIN×2 + SOPORTE_IT×1 = 3 filas)', async () => {
      // Filtra SOLO los roles que esta migración gestiona (ADMIN y SOPORTE_IT).
      // Otros roles (ej. ADMINISTRADOR, TECNICO de Change B) también reciben ticket:editar
      // vía sus propias migraciones — no deben afectar el recuento de idempotencia de esta.
      const { rows } = await pool.query(`
        SELECT r.codigo AS rol, p.codigo AS permiso
        FROM roles_permisos rp
        JOIN roles r ON r.id = rp.rol_id
        JOIN permisos p ON p.id = rp.permiso_id
        WHERE p.codigo IN ('ticket:editar', 'ticket:eliminar')
          AND r.codigo IN ('ADMIN', 'SOPORTE_IT')
        ORDER BY r.codigo, p.codigo
      `);
      // ADMIN: ticket:editar, ticket:eliminar (2)
      // SOPORTE_IT: ticket:editar (1)
      expect(rows).toHaveLength(3);
    });
  });
});
