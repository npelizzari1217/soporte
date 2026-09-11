/**
 * seed-unidades-medida.integration.spec.ts — issue #155 (bugfix).
 *
 * Un inquilino nuevo no puede cargar ningún insumo porque `unidades_medida`
 * nace vacía y el alta de insumo exige elegir una unidad. Esta migración de
 * datos siembra el mismo piso que `TenantSeederAdapter.UNIDADES_MEDIDA` en
 * los inquilinos que YA EXISTEN — mismo mecanismo que la migración hermana
 * `20260910120100_seed_familias_insumo_repuesto` (#147): `INSERT ... ON
 * CONFLICT ("codigo") DO NOTHING`.
 *
 * DE DÓNDE SALEN los 4 códigos: son los que produce YA USA en producción,
 * verificados contra el tenant "Santa Cruz" (issue #155) — `UNI` (Unidad),
 * `PAR` (Pares), `CM` (Centímetro), `MM` (Milímetro). No es una lista
 * inventada, mismo criterio que el #147 con `familias_insumo`.
 *
 * Estrategia TDD (RED antes de crear `migration.sql`, GREEN después),
 * mismo patrón que `backfill-cantidad-ordenada.integration.spec.ts`:
 *   1. DB tenant efímera.
 *   2. Se reproduce el schema tal como lo deja `prisma migrate deploy` justo
 *      ANTES de esta migración (todas las carpetas con nombre lexicográfico
 *      menor).
 *   3. Se corre el `migration.sql` bajo test, el mismo archivo que aplica
 *      `prisma migrate deploy` en producción.
 *
 * Dos escenarios, calcados de los dos inquilinos reales del issue:
 *   - "Cic Lanus" (0 unidades antes): la migración sobre un
 *     `unidades_medida` vacío deja las 4 filas con los códigos exactos.
 *   - "Santa Cruz" (4 unidades ya cargadas A MANO con los mismos códigos):
 *     el assert que importa — después de la migración sigue teniendo
 *     EXACTAMENTE 4, no 8, y las filas preexistentes NO se pisan
 *     (`ON CONFLICT DO NOTHING`, no un upsert).
 *
 * Ref issue: #155. Ref migración hermana: #147,
 * `20260910120100_seed_familias_insumo_repuesto`.
 */
import * as fs from 'fs';
import * as path from 'path';
import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { PostgresAdminService } from '../../../../clientes/infrastructure/postgres-admin.service';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../../../prisma_tenant/migrations');
const MIGRATION_FOLDER = '20260911120000_seed_unidades_medida';
const MIGRATION_FILE = path.join(MIGRATIONS_DIR, MIGRATION_FOLDER, 'migration.sql');

const CODIGOS = ['UNI', 'PAR', 'CM', 'MM'];

/** Corre, EN ORDEN, todos los `migration.sql` con carpeta anterior a la de este spec. */
async function aplicarMigracionesPrevias(pool: InstanceType<typeof Pool>): Promise<void> {
  const carpetas = fs
    .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entrada) => entrada.isDirectory())
    .map((entrada) => entrada.name)
    .filter((nombre) => nombre < MIGRATION_FOLDER)
    .sort();

  for (const carpeta of carpetas) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, carpeta, 'migration.sql'), 'utf8');
    await pool.query(sql);
  }
}

async function correrMigracionBajoTest(pool: InstanceType<typeof Pool>): Promise<void> {
  const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
  await pool.query(sql);
}

describe('Migration: seed_unidades_medida (issue #155)', () => {
  describe('inquilino sin unidades previas ("Cic Lanus")', () => {
    const admin = new PostgresAdminService(MASTER_TEST_URL);
    const DB_NAME = `soporte_seed_um_vacio_${randomBytes(4).toString('hex')}_test`;
    let pool: InstanceType<typeof Pool>;

    beforeAll(async () => {
      await admin.createDatabase(DB_NAME);
      const prismaServiceParaUrl = new PrismaService(MASTER_TEST_URL);
      pool = new Pool({ connectionString: prismaServiceParaUrl.buildTenantUrl(DB_NAME) });

      await aplicarMigracionesPrevias(pool);

      const { rows: previas } = await pool.query('SELECT codigo FROM unidades_medida');
      expect(previas).toHaveLength(0);

      await correrMigracionBajoTest(pool);
    }, 60_000);

    afterAll(async () => {
      await pool.end().catch(() => undefined);
      await admin.dropDatabase(DB_NAME);
    }, 30_000);

    it('[CRITICAL] siembra las 4 unidades exactas: UNI, PAR, CM, MM', async () => {
      const { rows } = await pool.query<{ codigo: string; nombre: string; activo: boolean }>(
        'SELECT codigo, nombre, activo FROM unidades_medida ORDER BY codigo',
      );
      expect(rows.map((r) => r.codigo)).toEqual(['CM', 'MM', 'PAR', 'UNI']);
      expect(rows.every((r) => r.activo)).toBe(true);

      const porCodigo = Object.fromEntries(rows.map((r) => [r.codigo, r.nombre]));
      expect(porCodigo).toEqual({
        UNI: 'Unidad',
        PAR: 'Pares',
        CM: 'Centímetro',
        MM: 'Milímetro',
      });
    });
  });

  describe('inquilino con las 4 unidades ya cargadas a mano ("Santa Cruz")', () => {
    const admin = new PostgresAdminService(MASTER_TEST_URL);
    const DB_NAME = `soporte_seed_um_previo_${randomBytes(4).toString('hex')}_test`;
    let pool: InstanceType<typeof Pool>;
    let idOriginalUni: string;

    beforeAll(async () => {
      await admin.createDatabase(DB_NAME);
      const prismaServiceParaUrl = new PrismaService(MASTER_TEST_URL);
      pool = new Pool({ connectionString: prismaServiceParaUrl.buildTenantUrl(DB_NAME) });

      await aplicarMigracionesPrevias(pool);

      // Simula las 4 unidades que Santa Cruz cargó A MANO, con los mismos
      // códigos que la migración va a intentar sembrar. `UNI` lleva un
      // nombre DISTINTO ("Unidad (manual)") a propósito: si la migración
      // pisara la fila en vez de hacer DO NOTHING, este nombre cambiaría.
      const manual = await pool.query<{ id: string }>(
        `INSERT INTO unidades_medida (id, codigo, nombre, activo, created_at, updated_at)
         VALUES (gen_random_uuid(), 'UNI', 'Unidad (manual)', true, now(), now())
         RETURNING id`,
      );
      idOriginalUni = manual.rows[0]!.id;
      await pool.query(
        `INSERT INTO unidades_medida (id, codigo, nombre, activo, created_at, updated_at) VALUES
           (gen_random_uuid(), 'PAR', 'Pares (manual)', true, now(), now()),
           (gen_random_uuid(), 'CM', 'Centímetro (manual)', true, now(), now()),
           (gen_random_uuid(), 'MM', 'Milímetro (manual)', true, now(), now())`,
      );

      await correrMigracionBajoTest(pool);
    }, 60_000);

    afterAll(async () => {
      await pool.end().catch(() => undefined);
      await admin.dropDatabase(DB_NAME);
    }, 30_000);

    it('[CRITICAL] sigue teniendo EXACTAMENTE 4 unidades, no 8', async () => {
      const { rows } = await pool.query<{ count: string }>(
        'SELECT COUNT(*) FROM unidades_medida WHERE codigo = ANY($1)',
        [CODIGOS],
      );
      expect(rows[0]!.count).toBe('4');
    });

    it('[CRITICAL] la fila preexistente NO se pisa (ON CONFLICT DO NOTHING, no upsert)', async () => {
      const { rows } = await pool.query<{ id: string; nombre: string }>(
        'SELECT id, nombre FROM unidades_medida WHERE codigo = $1',
        ['UNI'],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]!.id).toBe(idOriginalUni);
      expect(rows[0]!.nombre).toBe('Unidad (manual)');
    });

    it('idempotencia: correr la migración una segunda vez no duplica ninguna unidad', async () => {
      await correrMigracionBajoTest(pool);

      const { rows } = await pool.query<{ count: string }>(
        'SELECT COUNT(*) FROM unidades_medida WHERE codigo = ANY($1)',
        [CODIGOS],
      );
      expect(rows[0]!.count).toBe('4');
    });
  });
});
