/**
 * preventivo-plan-tipo-migracion.integration.spec.ts — migración
 * `20261025130000_preventivo_plan_tipo` (odd/preventivo-por-tipo, S3): aplicar, revertir y
 * reaplicar sobre una base real, con planes que existían antes de la columna.
 *
 * TENANT EFÍMERO propio (mismo patrón que `preventivo-schema.integration.spec.ts`): los casos
 * revierten la migración y la reaplican, así que no pueden compartir base con otros specs. Cliente
 * `pg` crudo: el sujeto es el SQL de la migración, no el repositorio.
 *
 * Los casos corren en orden y cada uno deja la migración aplicada al terminar.
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

const TENANT_DB_NAME = `soporte_prov_prevtipo_${randomBytes(4).toString('hex')}_test`;
const MIGRACION = join(
  __dirname,
  '../../../../../prisma_tenant/migrations/20261025130000_preventivo_plan_tipo',
);
const sql = (archivo: string): string => readFileSync(join(MIGRACION, archivo), 'utf8');

function buildTenantUrl(dbName: string): string {
  const url = new URL(MASTER_TEST_URL);
  url.pathname = `/${dbName}`;
  return url.toString();
}

describe('Migración 20261025130000_preventivo_plan_tipo (S3, tenant efímero)', () => {
  const admin = new PostgresAdminService(MASTER_TEST_URL);
  const migrationRunner = new TenantMigrationRunnerAdapter(MASTER_TEST_URL);
  let client: Client;

  let prioridadId: string;
  let tipoPreventivoId: string;
  let otroTipoId: string;

  beforeAll(async () => {
    await admin.createDatabase(TENANT_DB_NAME);
    await migrationRunner.run(TENANT_DB_NAME);

    client = new Client({ connectionString: buildTenantUrl(TENANT_DB_NAME) });
    await client.connect();

    prioridadId = (
      await client.query(
        `INSERT INTO prioridades (id, codigo, nombre, updated_at)
         VALUES (gen_random_uuid(), 'TEST_PREV_TIPO', 'Prioridad test', now()) RETURNING id`,
      )
    ).rows[0].id as string;
    // Lo inserta la migración 20260909120000_add_tipo_preventivo en todo tenant.
    tipoPreventivoId = (
      await client.query(`SELECT id FROM tipos_ticket WHERE codigo = 'PREVENTIVO'`)
    ).rows[0].id as string;
    otroTipoId = (
      await client.query(
        `INSERT INTO tipos_ticket (id, codigo, nombre, modulo, updated_at)
         VALUES (gen_random_uuid(), 'TEST_OTRO', 'Otro tipo', 'TICKETS', now()) RETURNING id`,
      )
    ).rows[0].id as string;
  }, 60_000);

  afterAll(async () => {
    await client.end();
    await admin.dropDatabase(TENANT_DB_NAME);
  }, 60_000);

  /** Inserta un plan con el schema PREVIO a la migración (sin `tipo_id`). */
  async function insertPlanSinTipo(titulo: string, dadoDeBaja = false): Promise<string> {
    const result = await client.query(
      `INSERT INTO planes_preventivo
         (id, titulo, ubicacion, prioridad_id, responsable_id, intervalo_valor, intervalo_unidad,
          fecha_inicio, proxima_ejecucion_en, activo, deleted_at, updated_at)
       VALUES (gen_random_uuid(), $1, 'DEPOSITO', $2, gen_random_uuid(), 7, 'DIAS',
               '2026-01-01', '2026-01-08', $3, $4, now())
       RETURNING id`,
      [titulo, prioridadId, !dadoDeBaja, dadoDeBaja ? new Date('2026-02-01') : null],
    );
    return result.rows[0].id as string;
  }

  async function estructura(): Promise<{ nullable: string | null; fk: number; indice: number }> {
    const columna = await client.query(
      `SELECT is_nullable FROM information_schema.columns
        WHERE table_name = 'planes_preventivo' AND column_name = 'tipo_id'`,
    );
    const fk = await client.query(
      `SELECT 1 FROM pg_constraint WHERE conname = 'planes_preventivo_tipo_id_fkey'`,
    );
    const indice = await client.query(
      `SELECT 1 FROM pg_indexes WHERE indexname = 'planes_preventivo_tipo_id_idx'`,
    );
    return {
      nullable: columna.rows.length === 0 ? null : (columna.rows[0].is_nullable as string),
      fk: fk.rowCount ?? 0,
      indice: indice.rowCount ?? 0,
    };
  }

  it('aplicada: tipo_id NOT NULL con FK a tipos_ticket e índice', async () => {
    expect(await estructura()).toEqual({ nullable: 'NO', fk: 1, indice: 1 });
    await expect(
      client.query(
        `INSERT INTO planes_preventivo
           (id, titulo, ubicacion, prioridad_id, tipo_id, responsable_id, intervalo_valor,
            intervalo_unidad, fecha_inicio, proxima_ejecucion_en, updated_at)
         VALUES (gen_random_uuid(), 'Plan tipo inexistente', 'DEPOSITO', $1, gen_random_uuid(),
                 gen_random_uuid(), 7, 'DIAS', '2026-01-01', '2026-01-08', now())`,
        [prioridadId],
      ),
    ).rejects.toThrow(/planes_preventivo_tipo_id_fkey/);
  });

  it('S3: rollback (dos veces) y reaplicación → todo plan previo, también el dado de baja, queda en PREVENTIVO', async () => {
    const conOtroTipo = (
      await client.query(
        `INSERT INTO planes_preventivo
           (id, titulo, ubicacion, prioridad_id, tipo_id, responsable_id, intervalo_valor,
            intervalo_unidad, fecha_inicio, proxima_ejecucion_en, updated_at)
         VALUES (gen_random_uuid(), 'Plan de otro tipo', 'DEPOSITO', $1, $2, gen_random_uuid(),
                 7, 'DIAS', '2026-01-01', '2026-01-08', now())
         RETURNING id`,
        [prioridadId, otroTipoId],
      )
    ).rows[0].id as string;

    await client.query(sql('rollback.sql'));
    await client.query(sql('rollback.sql'));
    expect(await estructura()).toEqual({ nullable: null, fk: 0, indice: 0 });

    const vigente = await insertPlanSinTipo('Plan previo vigente');
    const dadoDeBaja = await insertPlanSinTipo('Plan previo dado de baja', true);

    await client.query(sql('migration.sql'));

    expect(await estructura()).toEqual({ nullable: 'NO', fk: 1, indice: 1 });
    const filas = await client.query(
      'SELECT id, tipo_id FROM planes_preventivo WHERE id = ANY($1::uuid[])',
      [[vigente, dadoDeBaja, conOtroTipo]],
    );
    // El rollback pierde el tipo elegido (lo dice rollback.sql): al reaplicar, también PREVENTIVO.
    expect(new Map(filas.rows.map((f) => [f.id as string, f.tipo_id as string]))).toEqual(
      new Map([
        [vigente, tipoPreventivoId],
        [dadoDeBaja, tipoPreventivoId],
        [conOtroTipo, tipoPreventivoId],
      ]),
    );
  });

  it('con planes y sin el tipo PREVENTIVO falla con un mensaje que lo dice, y no deja nada a medias', async () => {
    await client.query(sql('rollback.sql'));
    await client.query(`UPDATE tipos_ticket SET codigo = 'PREVENTIVO_RENOMBRADO' WHERE id = $1`, [
      tipoPreventivoId,
    ]);

    await expect(client.query(sql('migration.sql'))).rejects.toThrow(
      'preventivo_plan_tipo: el tenant tiene planes preventivos y no tiene el tipo de ticket PREVENTIVO.',
    );
    // El script corre en una sola transacción implícita: la columna agregada se deshace con el error.
    expect(await estructura()).toEqual({ nullable: null, fk: 0, indice: 0 });

    await client.query(`UPDATE tipos_ticket SET codigo = 'PREVENTIVO' WHERE id = $1`, [
      tipoPreventivoId,
    ]);
    await client.query(sql('migration.sql'));
    expect(await estructura()).toEqual({ nullable: 'NO', fk: 1, indice: 1 });
  });

  it('sin planes, migra aunque el tenant no tenga el tipo PREVENTIVO', async () => {
    await client.query(sql('rollback.sql'));
    await client.query('DELETE FROM planes_preventivo');
    await client.query(`UPDATE tipos_ticket SET codigo = 'PREVENTIVO_RENOMBRADO' WHERE id = $1`, [
      tipoPreventivoId,
    ]);

    await client.query(sql('migration.sql'));

    expect(await estructura()).toEqual({ nullable: 'NO', fk: 1, indice: 1 });
    await client.query(`UPDATE tipos_ticket SET codigo = 'PREVENTIVO' WHERE id = $1`, [
      tipoPreventivoId,
    ]);
  });
});
