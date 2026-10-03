/**
 * [INTEGRATION] Migración `20261003150000_tickets_solicitante_externo` (sdd/formulario-publico-qr,
 * WU-7, ADR-6 pasos 2 a 4) contra Postgres REAL, en un tenant EFÍMERO migrado con todas las
 * migraciones: `solicitante_id` nullable, `solicitante_externo_id` con FK RESTRICT y el CHECK
 * `tickets_solicitante_exactamente_uno` (ambos o ninguno falla; cada uno solo, pasa).
 *
 * También cubre el viaje de ida y vuelta: las filas viejas (solo `solicitante_id`) sobreviven a
 * reaplicar `migration.sql`, y `rollback.sql` falla POR DISEÑO —de forma atómica— si ya existe un
 * ticket externo. Higiene: la base entera es efímera y propia; se cierra el cliente y se dropea.
 * No toca master: sin `usarLockMasterTest()`.
 */
import { randomBytes } from 'node:crypto';
import * as fs from 'fs';
import * as path from 'path';
import { Client } from 'pg';
import { PostgresAdminService } from '../../../../clientes/infrastructure/postgres-admin.service';
import { TenantMigrationRunnerAdapter } from '../../../../clientes/infrastructure/tenant-migration-runner.adapter';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const DB = `soporte_tkt_ext_${randomBytes(4).toString('hex')}_test`;
const CARPETA = path.resolve(
  __dirname,
  '../../../../../prisma_tenant/migrations/20261003150000_tickets_solicitante_externo',
);
const leer = (archivo: string): string => fs.readFileSync(path.join(CARPETA, archivo), 'utf8');

function buildTenantUrl(dbName: string): string {
  const url = new URL(MASTER_TEST_URL);
  url.pathname = `/${dbName}`;
  return url.toString();
}

describe('tickets.solicitante_externo_id — nullable, FK y CHECK (WU-7, tenant efímero)', () => {
  const admin = new PostgresAdminService(MASTER_TEST_URL);
  let client: Client;
  let tipoId: string;
  let estadoId: string;
  let prioridadId: string;
  let contador = 0;

  beforeAll(async () => {
    await admin.createDatabase(DB);
    await new TenantMigrationRunnerAdapter(MASTER_TEST_URL).run(DB);
    client = new Client({ connectionString: buildTenantUrl(DB) });
    await client.connect();

    prioridadId = (
      await client.query(
        `INSERT INTO prioridades (id, codigo, nombre, updated_at)
         VALUES (gen_random_uuid(), 'TEST_WU7', 'Prioridad test WU-7', now()) RETURNING id`,
      )
    ).rows[0].id as string;
    estadoId = (
      await client.query(
        `INSERT INTO estados (id, codigo, nombre, updated_at)
         VALUES (gen_random_uuid(), 'TEST_WU7_NUEVO', 'Nuevo test WU-7', now()) RETURNING id`,
      )
    ).rows[0].id as string;
    tipoId = (
      await client.query(
        `INSERT INTO tipos_ticket (id, codigo, nombre, modulo, updated_at)
         VALUES (gen_random_uuid(), 'TEST_WU7_SOPORTE', 'Soporte test WU-7', 'SOPORTE', now())
         RETURNING id`,
      )
    ).rows[0].id as string;
  }, 120_000);

  afterAll(async () => {
    await client?.end();
    await admin.dropDatabase(DB);
  }, 60_000);

  beforeEach(async () => {
    await client.query('DELETE FROM tickets');
    await client.query('DELETE FROM solicitantes_externos');
  });

  async function nuevoExterno(): Promise<string> {
    const r = await client.query(
      `INSERT INTO solicitantes_externos (nombre, email, email_verificado_at)
       VALUES ('Ana', 'ana@ejemplo.com', now()) RETURNING id`,
    );
    return r.rows[0].id as string;
  }

  /** Inserta un ticket con las dos columnas de solicitante tal como se pasan (null o uuid). */
  async function insertTicket(
    solicitanteId: string | null,
    solicitanteExternoId: string | null,
  ): Promise<void> {
    contador += 1;
    await client.query(
      `INSERT INTO tickets
         (id, numero, titulo, tipo_id, estado_id, prioridad_id, solicitante_id,
          solicitante_externo_id, updated_at)
       VALUES (gen_random_uuid(), $1, 'Ticket test WU-7', $2, $3, $4, $5, $6, now())`,
      [`WU7TEST-${contador}`, tipoId, estadoId, prioridadId, solicitanteId, solicitanteExternoId],
    );
  }

  const uuidInterno = '00000000-0000-4000-8000-000000000001';

  it('solicitante_id admite NULL y solicitante_externo_id existe', async () => {
    const cols = await client.query(
      `SELECT column_name, is_nullable FROM information_schema.columns
       WHERE table_name = 'tickets'
         AND column_name IN ('solicitante_id', 'solicitante_externo_id')
       ORDER BY column_name`,
    );
    expect(cols.rows).toEqual([
      { column_name: 'solicitante_externo_id', is_nullable: 'YES' },
      { column_name: 'solicitante_id', is_nullable: 'YES' },
    ]);
  });

  it('acepta solo solicitante_id (ticket interno)', async () => {
    await expect(insertTicket(uuidInterno, null)).resolves.toBeUndefined();
  });

  it('acepta solo solicitante_externo_id (ticket del formulario publico)', async () => {
    const externo = await nuevoExterno();
    await expect(insertTicket(null, externo)).resolves.toBeUndefined();
  });

  it('rechaza AMBOS con el CHECK', async () => {
    const externo = await nuevoExterno();
    await expect(insertTicket(uuidInterno, externo)).rejects.toThrow(
      /tickets_solicitante_exactamente_uno/,
    );
  });

  it('rechaza NINGUNO con el CHECK', async () => {
    await expect(insertTicket(null, null)).rejects.toThrow(/tickets_solicitante_exactamente_uno/);
  });

  it('el UPDATE tampoco puede dejar al ticket sin solicitante', async () => {
    await insertTicket(uuidInterno, null);
    await expect(client.query('UPDATE tickets SET solicitante_id = NULL')).rejects.toThrow(
      /tickets_solicitante_exactamente_uno/,
    );
  });

  it('la FK rechaza un externo inexistente', async () => {
    await expect(insertTicket(null, '00000000-0000-4000-8000-0000000000ff')).rejects.toThrow(
      /tickets_solicitante_externo_id_fkey/,
    );
  });

  it('la FK es RESTRICT: no se borra un externo con ticket', async () => {
    const externo = await nuevoExterno();
    await insertTicket(null, externo);
    await expect(
      client.query('DELETE FROM solicitantes_externos WHERE id = $1', [externo]),
    ).rejects.toThrow(/tickets_solicitante_externo_id_fkey/);
  });

  it('rollback.sql falla por diseño con un ticket externo y NO deja nada a medias', async () => {
    const externo = await nuevoExterno();
    await insertTicket(null, externo);

    await expect(client.query(leer('rollback.sql'))).rejects.toThrow(/solicitante_id/);

    const cols = await client.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'tickets' AND column_name = 'solicitante_externo_id'`,
    );
    const check = await client.query(
      `SELECT 1 FROM pg_constraint WHERE conname = 'tickets_solicitante_exactamente_uno'`,
    );
    expect(cols.rowCount).toBe(1);
    expect(check.rowCount).toBe(1);
    expect((await client.query('SELECT 1 FROM tickets')).rowCount).toBe(1);
  });

  it('ida y vuelta: sin tickets externos el rollback revierte, y reaplicar conserva las filas viejas', async () => {
    await insertTicket(uuidInterno, null);

    await client.query(leer('rollback.sql'));
    const nullable = await client.query(
      `SELECT is_nullable FROM information_schema.columns
       WHERE table_name = 'tickets' AND column_name = 'solicitante_id'`,
    );
    expect(nullable.rows).toEqual([{ is_nullable: 'NO' }]);
    await expect(insertTicket(null, null)).rejects.toThrow();

    // Reaplicar valida con el CHECK las filas que ya existían: la fila vieja lo cumple.
    await client.query(leer('migration.sql'));
    const filas = await client.query('SELECT solicitante_id, solicitante_externo_id FROM tickets');
    expect(filas.rows).toEqual([{ solicitante_id: uuidInterno, solicitante_externo_id: null }]);
    await expect(insertTicket(null, null)).rejects.toThrow(/tickets_solicitante_exactamente_uno/);
  });
});
