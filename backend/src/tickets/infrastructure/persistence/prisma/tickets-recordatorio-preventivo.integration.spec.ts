/**
 * tickets-recordatorio-preventivo.integration.spec.ts — T3 de odd/preventivo-anticipacion.
 *
 * Contra Postgres REAL, en un tenant efimero propio: ejerce la migracion
 * `20261025120000_tickets_recordatorio_preventivo` (columna TIMESTAMPTZ nullable, indice parcial,
 * rollback re-ejecutable). Cliente `pg` crudo: el sujeto es el SQL.
 */
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import { PostgresAdminService } from '../../../../clientes/infrastructure/postgres-admin.service';
import { TenantMigrationRunnerAdapter } from '../../../../clientes/infrastructure/tenant-migration-runner.adapter';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';
const TENANT_DB_NAME = `soporte_prov_recprev_${randomBytes(4).toString('hex')}_test`;
const MIGRACION = join(
  __dirname,
  '../../../../../prisma_tenant/migrations/20261025120000_tickets_recordatorio_preventivo',
);
const sql = (archivo: string): string => readFileSync(join(MIGRACION, archivo), 'utf8');

function buildTenantUrl(dbName: string): string {
  const url = new URL(MASTER_TEST_URL);
  url.pathname = `/${dbName}`;
  return url.toString();
}

describe('tickets — migracion de la marca de recordatorio de preventivo (tenant efimero)', () => {
  const admin = new PostgresAdminService(MASTER_TEST_URL);
  const migrationRunner = new TenantMigrationRunnerAdapter(MASTER_TEST_URL);
  let client: Client;

  beforeAll(async () => {
    await admin.createDatabase(TENANT_DB_NAME);
    await migrationRunner.run(TENANT_DB_NAME);
    client = new Client({ connectionString: buildTenantUrl(TENANT_DB_NAME) });
    await client.connect();
  }, 60_000);

  afterAll(async () => {
    await client.end();
    await admin.dropDatabase(TENANT_DB_NAME);
  }, 60_000);

  async function columna() {
    return client.query(
      `SELECT data_type, column_default, is_nullable FROM information_schema.columns
        WHERE table_name = 'tickets' AND column_name = 'recordatorio_enviado_at'`,
    );
  }

  async function indice() {
    return client.query(
      `SELECT indexdef FROM pg_indexes WHERE indexname = 'tickets_recordatorio_pendiente_idx'`,
    );
  }

  it('recordatorio_enviado_at nace TIMESTAMPTZ, nullable y sin default (ningún ticket figura avisado)', async () => {
    const r = await columna();
    expect(r.rows).toEqual([
      { data_type: 'timestamp with time zone', column_default: null, is_nullable: 'YES' },
    ]);
  });

  it('el índice es parcial: solo tickets con fecha objetivo y sin recordatorio', async () => {
    const r = await indice();
    expect(r.rows[0].indexdef).toMatch(
      /WHERE \(\(fecha_objetivo IS NOT NULL\) AND \(recordatorio_enviado_at IS NULL\)\)/,
    );
  });

  it('rollback.sql retira columna e índice, se puede correr dos veces, y la migración se reaplica', async () => {
    await client.query(sql('rollback.sql'));
    await client.query(sql('rollback.sql'));
    expect((await columna()).rows).toHaveLength(0);
    expect((await indice()).rows).toHaveLength(0);

    await client.query(sql('migration.sql'));
    expect((await columna()).rows).toHaveLength(1);
    expect((await indice()).rows).toHaveLength(1);
  });
});
