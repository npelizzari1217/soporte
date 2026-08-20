/**
 * add-cliente-smtp-config.integration.spec.ts — WU2
 * (sdd/configuracion-correo-por-cliente).
 *
 * Verifica la migración `20260820160000_add_cliente_smtp_config` (design D4)
 * contra Postgres REAL. Mismo patrón que
 * `rename-modulo-soporte-a-tickets.integration.spec.ts`: DB EFÍMERA propia,
 * NO la `soporte_master_test` compartida — esa DB ya tiene esta migración
 * aplicada de forma PERMANENTE (la necesita `pnpm generate:master` +
 * el resto de la suite de integración, que usa el Prisma Client real contra
 * ella), así que re-correr acá el mismo `ADD COLUMN` chocaría con columnas
 * que ya existen. La DB efímera reproduce el schema justo ANTES de esta
 * migración y corre el `migration.sql` bajo test una única vez.
 *
 * Ref spec: sdd/configuracion-correo-por-cliente/spec — "All-or-nothing SMTP
 * configuration". Ref design: D4. Tarea: 2.4.
 */
import { Pool } from 'pg';
import { randomBytes } from 'node:crypto';
import * as fs from 'fs';
import * as path from 'path';
import { PostgresAdminService } from '../src/clientes/infrastructure/postgres-admin.service';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const MASTER_MIGRATIONS_DIR = path.resolve(__dirname, './migrations');
// Última carpeta que este fixture necesita reproducir ANTES de la migración
// bajo test.
const ULTIMA_CARPETA_PREVIA = '20260819130000_add_kb_articulos';
const MIGRATION_UNDER_TEST = '20260820160000_add_cliente_smtp_config';
const EPHEMERAL_DB_NAME = `soporte_smtp_config_${randomBytes(4).toString('hex')}_test`;

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

const MIGRATION_FILE = path.resolve(__dirname, `./migrations/${MIGRATION_UNDER_TEST}/migration.sql`);

describe('Migración 20260820160000 — config SMTP por cliente (WU2, master)', () => {
  let pool: InstanceType<typeof Pool>;
  const admin = new PostgresAdminService(MASTER_TEST_URL);

  beforeAll(async () => {
    await admin.createDatabase(EPHEMERAL_DB_NAME);
    const ephemeralUrl = new URL(MASTER_TEST_URL);
    ephemeralUrl.pathname = `/${EPHEMERAL_DB_NAME}`;
    pool = new Pool({ connectionString: ephemeralUrl.toString() });

    // Reproduce el schema justo antes de la migración bajo test — DB efímera
    // y recién creada, no hace falta TRUNCATE previo.
    await reproducirSchemaPrevio(pool);

    const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
    await pool.query(sql);
  }, 60_000);

  afterAll(async () => {
    await pool.end().catch(() => undefined);
    await admin.dropDatabase(EPHEMERAL_DB_NAME);
  }, 30_000);

  it('[D4] agrega las 9 columnas SMTP, todas nullable', async () => {
    const result = await pool.query(
      `SELECT column_name, is_nullable FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'clientes'
         AND column_name LIKE 'smtp_%'
       ORDER BY column_name`,
    );
    const columnas = result.rows.map((r) => r.column_name as string);
    expect(columnas).toEqual([
      'smtp_config_updated_at',
      'smtp_from',
      'smtp_host',
      'smtp_password_cifrada',
      'smtp_port',
      'smtp_secure',
      'smtp_user',
      'smtp_verificacion_error',
      'smtp_verificado_at',
    ]);
    expect(result.rows.every((r) => r.is_nullable === 'YES')).toBe(true);
  });

  it('[D4] el CHECK rechaza una config SMTP parcial', async () => {
    await expect(
      pool.query(
        `INSERT INTO clientes (id, nombre, db_name, smtp_host, smtp_port, updated_at)
         VALUES (gen_random_uuid(), 'Fixture WU2 parcial', 'test_wu2_parcial', 'smtp.test', 587, now())`,
      ),
    ).rejects.toThrow(/clientes_smtp_config_todo_o_nada_check/);
  });

  it('[D4] el CHECK acepta una config SMTP completa (los 5 campos juntos)', async () => {
    await expect(
      pool.query(
        `INSERT INTO clientes (
           id, nombre, db_name, updated_at,
           smtp_host, smtp_port, smtp_user, smtp_from, smtp_password_cifrada
         )
         VALUES (
           gen_random_uuid(), 'Fixture WU2 completa', 'test_wu2_completa', now(),
           'smtp.test', 587, 'usuario@test.local', 'no-reply@test.local', 'v1:iv:tag:ct'
         )`,
      ),
    ).resolves.toBeTruthy();
  });

  it('[D4] el CHECK acepta ausencia total de config (los 5 campos en NULL)', async () => {
    await expect(
      pool.query(
        `INSERT INTO clientes (id, nombre, db_name, updated_at)
         VALUES (gen_random_uuid(), 'Fixture WU2 sin config', 'test_wu2_sin_config', now())`,
      ),
    ).resolves.toBeTruthy();
  });
});
