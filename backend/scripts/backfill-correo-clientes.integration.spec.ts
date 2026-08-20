/**
 * backfill-correo-clientes.integration.spec.ts — WU6 (sdd/configuracion-correo-por-cliente).
 *
 * Contra Postgres REAL, DB EFÍMERA propia (mismo patrón que
 * `add-cliente-smtp-config.integration.spec.ts`) — nunca toca
 * `soporte_master` ni `soporte_master_test`. Prueba las dos restricciones
 * duras del orquestador para WU6: (1) idempotencia real — correr el
 * backfill dos veces no cambia nada en la segunda vuelta — y (2) que NUNCA
 * pisa una config que ROOT ya cargó a mano.
 *
 * Ref design: D5. Ref tasks: WU6 6.3.
 */
import { Pool } from 'pg';
import { randomBytes } from 'node:crypto';
import * as fs from 'fs';
import * as path from 'path';
import { PostgresAdminService } from '../src/clientes/infrastructure/postgres-admin.service';
import { ejecutarBackfill, leerConfigDesdeEnv } from './backfill-correo-clientes.mjs';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const MASTER_MIGRATIONS_DIR = path.resolve(__dirname, '../prisma_master/migrations');
// Carpeta de la migración que agrega las columnas SMTP (WU2) — la
// reproducimos INCLUIDA, porque acá probamos el backfill, no la migración.
const ULTIMA_CARPETA_PREVIA = '20260820160000_add_cliente_smtp_config';
const EPHEMERAL_DB_NAME = `soporte_backfill_correo_${randomBytes(4).toString('hex')}_test`;

const CONFIG = leerConfigDesdeEnv({
  SMTP_HOST: 'smtp.legacy.test',
  SMTP_PORT: '587',
  SMTP_USER: 'legacy@test.local',
  SMTP_PASSWORD: 'legacy-password',
  SMTP_FROM: 'no-reply@test.local',
  SMTP_SECURE: 'false',
  EMAIL_CRYPTO_KEY: 'c'.repeat(64),
});

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

describe('backfill-correo-clientes — idempotencia y no-pisado de config manual (WU6, master)', () => {
  let pool: InstanceType<typeof Pool>;
  const admin = new PostgresAdminService(MASTER_TEST_URL);
  let sinConfigId: string;
  let conConfigManualId: string;

  beforeAll(async () => {
    await admin.createDatabase(EPHEMERAL_DB_NAME);
    const ephemeralUrl = new URL(MASTER_TEST_URL);
    ephemeralUrl.pathname = `/${EPHEMERAL_DB_NAME}`;
    pool = new Pool({ connectionString: ephemeralUrl.toString() });

    // Reproduce el schema hasta e incluyendo las columnas SMTP — DB efímera
    // y recién creada, no hace falta TRUNCATE previo.
    await reproducirSchemaPrevio(pool);

    const sinConfig = await pool.query(
      `INSERT INTO clientes (id, nombre, db_name, updated_at)
       VALUES (gen_random_uuid(), 'Fixture WU6 sin config', 'test_wu6_sin_config', now())
       RETURNING id`,
    );
    sinConfigId = sinConfig.rows[0].id as string;

    // Fixture que simula un cliente cuya config YA fue cargada a mano por
    // ROOT antes de correr el backfill — el backfill nunca debe tocarla.
    const conConfigManual = await pool.query(
      `INSERT INTO clientes (
         id, nombre, db_name, updated_at,
         smtp_host, smtp_port, smtp_user, smtp_from, smtp_password_cifrada
       )
       VALUES (
         gen_random_uuid(), 'Fixture WU6 config manual', 'test_wu6_config_manual', now(),
         'smtp.manual.test', 465, 'manual@test.local', 'manual@test.local', 'v1:manual:manual:manual'
       )
       RETURNING id`,
    );
    conConfigManualId = conConfigManual.rows[0].id as string;
  }, 60_000);

  afterAll(async () => {
    await pool.end().catch(() => undefined);
    await admin.dropDatabase(EPHEMERAL_DB_NAME);
  }, 30_000);

  it('primera corrida: rellena el cliente sin config y deja intacta la config manual', async () => {
    const resultado = await ejecutarBackfill(pool, CONFIG);

    expect(resultado.actualizados).toBe(1);

    const { rows } = await pool.query(
      `SELECT id, smtp_host, smtp_port, smtp_secure, smtp_password_cifrada
         FROM clientes WHERE id = ANY($1) ORDER BY id`,
      [[sinConfigId, conConfigManualId]],
    );
    const backfillado = rows.find((r) => r.id === sinConfigId);
    const manual = rows.find((r) => r.id === conConfigManualId);

    expect(backfillado.smtp_host).toBe('smtp.legacy.test');
    expect(backfillado.smtp_port).toBe(587);
    expect(backfillado.smtp_password_cifrada).not.toBeNull();
    expect(backfillado.smtp_password_cifrada).toMatch(/^v1:/);

    // La config manual no cambió — mismo host, mismo ciphertext de siempre.
    expect(manual.smtp_host).toBe('smtp.manual.test');
    expect(manual.smtp_password_cifrada).toBe('v1:manual:manual:manual');
  });

  it('segunda corrida: 0 filas actualizadas (idempotente)', async () => {
    const resultado = await ejecutarBackfill(pool, CONFIG);

    expect(resultado.actualizados).toBe(0);
    expect(resultado.configurados).toBe(2);
    expect(resultado.sin_config).toBe(0);

    // La config manual sigue exactamente igual después de una segunda corrida.
    const { rows } = await pool.query(
      `SELECT smtp_password_cifrada FROM clientes WHERE id = $1`,
      [conConfigManualId],
    );
    expect(rows[0].smtp_password_cifrada).toBe('v1:manual:manual:manual');
  });
});
