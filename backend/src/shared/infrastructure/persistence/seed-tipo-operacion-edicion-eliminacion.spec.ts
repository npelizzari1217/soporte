/**
 * S1-T3 TEST — Integration: migración tenant seed_tipo_operacion_edicion_eliminacion
 *
 * RED → antes de S1-T4 (migration.sql no existe → falla con ENOENT).
 * GREEN → después de crear la migration.sql con los INSERTs correctos.
 *
 * Estrategia: lee el archivo SQL de la migración y lo aplica sobre la DB tenant de test.
 * Verifica que EDICION y ELIMINACION queden en tipo_operacion con UUIDs deterministas.
 *
 * DB de test: DATABASE_URL_TENANT o fallback local soporte_tenant_test.
 * No requiere TRUNCATE: usa ON CONFLICT DO NOTHING (idempotente).
 *
 * Ref spec: [SPEC:tickets-core/Seed de tipo_operacion EDICION y ELIMINACION presente en todo tenant]
 * Tarea: S1-T3 (tickets-editar-borrar)
 */
import * as fs from 'fs';
import * as path from 'path';
import { Pool } from 'pg';

const TEST_URL =
  process.env.DATABASE_URL_TENANT ??
  'postgresql://soporte:soporte@localhost:5432/soporte_tenant_test';

const MIGRATION_FILE = path.resolve(
  __dirname,
  '../../../../prisma_tenant/migrations/20260627010000_seed_tipo_operacion_edicion_eliminacion/migration.sql',
);

describe('Migration: seed_tipo_operacion_edicion_eliminacion (tenant)', () => {
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

  // ─── tipo_operacion sembrados ──────────────────────────────────────────────

  it("EDICION existe con id 'f0000000-0000-4000-f000-000000000007'", async () => {
    const { rows } = await pool.query(
      "SELECT id FROM tipo_operacion WHERE codigo = 'EDICION'",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('f0000000-0000-4000-f000-000000000007');
  });

  it("ELIMINACION existe con id 'f0000000-0000-4000-f000-000000000008'", async () => {
    const { rows } = await pool.query(
      "SELECT id FROM tipo_operacion WHERE codigo = 'ELIMINACION'",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('f0000000-0000-4000-f000-000000000008');
  });

  // ─── Idempotencia ─────────────────────────────────────────────────────────

  describe('idempotencia — 2ª ejecución sin error ni duplicados', () => {
    it('re-ejecutar la migración no lanza error', async () => {
      const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
      await expect(pool.query(sql)).resolves.not.toThrow();
    });

    it('no duplica filas tras 2ª ejecución', async () => {
      const { rows } = await pool.query(
        "SELECT codigo FROM tipo_operacion WHERE codigo IN ('EDICION', 'ELIMINACION') ORDER BY codigo",
      );
      expect(rows).toHaveLength(2);
    });
  });
});
