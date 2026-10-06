/**
 * prioridades-primera-respuesta.integration.spec.ts — WU-5 (sdd/sla-primera-respuesta-y-pausa).
 *
 * Contra Postgres REAL, en un tenant efimero propio: ejerce la migracion M3
 * `20261007140000_prioridades_primera_respuesta` (columna opcional, CHECK `> 0`, rollback).
 * Cliente `pg` crudo: el sujeto es el DDL, no el mapper.
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
const TENANT_DB_NAME = `soporte_prov_primresp_${randomBytes(4).toString('hex')}_test`;
const MIGRACION = join(
  __dirname,
  '../../../../../prisma_tenant/migrations/20261007140000_prioridades_primera_respuesta',
);
const sql = (archivo: string): string => readFileSync(join(MIGRACION, archivo), 'utf8');

function buildTenantUrl(dbName: string): string {
  const url = new URL(MASTER_TEST_URL);
  url.pathname = `/${dbName}`;
  return url.toString();
}

describe('prioridades — migracion M3 de la meta de primera respuesta (WU-5, tenant efimero)', () => {
  const admin = new PostgresAdminService(MASTER_TEST_URL);
  const migrationRunner = new TenantMigrationRunnerAdapter(MASTER_TEST_URL);
  let client: Client;
  let contador = 0;

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

  async function insertarPrioridad(horas: string): Promise<void> {
    contador += 1;
    await client.query(
      `INSERT INTO prioridades (id, codigo, nombre, updated_at, sla_primera_respuesta_horas)
       VALUES (gen_random_uuid(), $1, 'Prioridad M3', now(), ${horas})`,
      [`T_M3_${contador}`],
    );
  }

  it('las prioridades existentes quedan sin meta tras aplicar M3 (sin relleno ni recalculo)', async () => {
    await client.query(sql('rollback.sql'));
    await client.query(
      `INSERT INTO prioridades (id, codigo, nombre, updated_at)
       VALUES (gen_random_uuid(), 'T_M3_PREVIA', 'Previa', now())`,
    );

    await client.query(sql('migration.sql'));

    const r = await client.query(
      `SELECT sla_primera_respuesta_horas FROM prioridades WHERE codigo = 'T_M3_PREVIA'`,
    );
    expect(r.rows[0].sla_primera_respuesta_horas).toBeNull();
  });

  it('acepta una meta positiva y NULL (sin meta)', async () => {
    await insertarPrioridad('4');
    await insertarPrioridad('NULL');

    const r = await client.query(
      `SELECT count(*)::int AS n FROM prioridades WHERE codigo LIKE 'T_M3_%' AND codigo <> 'T_M3_PREVIA'`,
    );
    expect(r.rows[0].n).toBe(2);
  });

  it.each(['0', '-1'])('el CHECK rechaza la meta %s', async (horas) => {
    await expect(insertarPrioridad(horas)).rejects.toMatchObject({
      constraint: 'prioridades_sla_primera_respuesta_horas_check',
    });
  });

  it('el rollback quita la columna y su CHECK', async () => {
    await client.query(sql('rollback.sql'));

    const r = await client.query(
      `SELECT count(*)::int AS n FROM information_schema.columns
       WHERE table_name = 'prioridades' AND column_name = 'sla_primera_respuesta_horas'`,
    );
    expect(r.rows[0].n).toBe(0);
    await client.query(sql('migration.sql'));
  });
});
