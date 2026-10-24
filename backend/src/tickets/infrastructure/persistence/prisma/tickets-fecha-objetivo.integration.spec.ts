/**
 * tickets-fecha-objetivo.integration.spec.ts — T2 de odd/preventivo-anticipacion.
 *
 * Contra Postgres REAL, en un tenant efimero propio: ejerce la migracion
 * `20261025110000_tickets_fecha_objetivo` (columna DATE nullable sin default, rollback
 * re-ejecutable). Cliente `pg` crudo: el sujeto es el SQL.
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
const TENANT_DB_NAME = `soporte_prov_fobj_${randomBytes(4).toString('hex')}_test`;
const MIGRACION = join(
  __dirname,
  '../../../../../prisma_tenant/migrations/20261025110000_tickets_fecha_objetivo',
);
const sql = (archivo: string): string => readFileSync(join(MIGRACION, archivo), 'utf8');

function buildTenantUrl(dbName: string): string {
  const url = new URL(MASTER_TEST_URL);
  url.pathname = `/${dbName}`;
  return url.toString();
}

describe('tickets — migracion de fecha objetivo (tenant efimero)', () => {
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
        WHERE table_name = 'tickets' AND column_name = 'fecha_objetivo'`,
    );
  }

  it('fecha_objetivo nace DATE, nullable y sin default (los tickets existentes quedan sin fecha)', async () => {
    const r = await columna();
    expect(r.rows).toEqual([{ data_type: 'date', column_default: null, is_nullable: 'YES' }]);
  });

  it('rollback.sql retira la columna, se puede correr dos veces, y la migracion se reaplica', async () => {
    await client.query(sql('rollback.sql'));
    await client.query(sql('rollback.sql'));
    expect((await columna()).rows).toHaveLength(0);

    await client.query(sql('migration.sql'));
    expect((await columna()).rows).toHaveLength(1);
  });
});
