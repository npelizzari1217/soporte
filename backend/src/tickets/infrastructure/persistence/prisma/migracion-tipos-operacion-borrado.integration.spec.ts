/**
 * [INTEGRATION] Rollback de la migración `20261022120000_tipos_operacion_borrado`
 * (odd/tasks/permisos-por-tipo-ticket.md, S8, L45): deshacer la migración no borra el historial de
 * borrado y recuperación. Un ticket borrado sigue recuperable por SQL, y su historial es lo único
 * que dice quién lo borró y cuándo.
 *
 * Base de inquilino EFÍMERA con todas las migraciones; el `rollback.sql` y el `migration.sql` se
 * corren tal cual están en la carpeta.
 * No toca master: sin `usarLockMasterTest()`. Higiene: cerrar pool -> dropDatabase.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { PostgresAdminService } from '../../../../clientes/infrastructure/postgres-admin.service';
import { TenantMigrationRunnerAdapter } from '../../../../clientes/infrastructure/tenant-migration-runner.adapter';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const CARPETA = path.resolve(
  __dirname,
  '../../../../../prisma_tenant/migrations/20261022120000_tipos_operacion_borrado',
);
const DB = `soporte_migr_borrado_${randomBytes(4).toString('hex')}_test`;
const AUTOR = '01900000-0000-7000-8000-000000000601';

const leer = (archivo: string): string => fs.readFileSync(path.join(CARPETA, archivo), 'utf8');

describe('Migración 20261022120000_tipos_operacion_borrado — rollback', () => {
  const admin = new PostgresAdminService(MASTER_TEST_URL);
  let pool: InstanceType<typeof Pool>;
  let ticketId: string;

  /** Códigos del catálogo de borrado presentes, en orden. */
  async function codigosDelCatalogo(): Promise<string[]> {
    const r = await pool.query<{ codigo: string }>(
      `SELECT codigo FROM tipo_operacion
        WHERE codigo IN ('TICKET_BORRADO', 'TICKET_RECUPERADO') ORDER BY codigo`,
    );
    return r.rows.map((fila) => fila.codigo);
  }

  /** Historial del ticket como código de operación, por fecha. */
  async function historial(): Promise<string[]> {
    const r = await pool.query<{ codigo: string }>(
      `SELECT t.codigo FROM operaciones_ticket o JOIN tipo_operacion t ON t.id = o.tipo_operacion_id
        WHERE o.ticket_id = $1 ORDER BY o.created_at`,
      [ticketId],
    );
    return r.rows.map((fila) => fila.codigo);
  }

  beforeAll(async () => {
    await admin.createDatabase(DB);
    await new TenantMigrationRunnerAdapter(MASTER_TEST_URL).run(DB);
    pool = new Pool({ connectionString: new PrismaService(MASTER_TEST_URL).buildTenantUrl(DB) });

    const tipo = await pool.query<{ id: string }>(
      `INSERT INTO tipos_ticket (codigo, nombre, modulo, updated_at)
       VALUES ('T-ROLLBACK', 'Soporte', 'TICKETS', now()) RETURNING id`,
    );
    const estado = await pool.query<{ id: string }>(
      `INSERT INTO estados (codigo, nombre, updated_at) VALUES ('E-ROLLBACK', 'Nuevo', now()) RETURNING id`,
    );
    const prioridad = await pool.query<{ id: string }>(
      `INSERT INTO prioridades (codigo, nombre, updated_at) VALUES ('P-ROLLBACK', 'Media', now()) RETURNING id`,
    );
    // Ticket borrado: el historial tiene su borrado y nada más.
    const ticket = await pool.query<{ id: string }>(
      `INSERT INTO tickets (numero, titulo, tipo_id, estado_id, prioridad_id, solicitante_id,
                            deleted_at, updated_at)
       VALUES ('RB-1', 'Borrado', $1, $2, $3, $4, now(), now()) RETURNING id`,
      [tipo.rows[0]!.id, estado.rows[0]!.id, prioridad.rows[0]!.id, AUTOR],
    );
    ticketId = ticket.rows[0]!.id;
    await pool.query(
      `INSERT INTO operaciones_ticket (ticket_id, tipo_operacion_id, autor_id, es_interno, updated_at)
       SELECT $1, id, $2, true, now() FROM tipo_operacion WHERE codigo = 'TICKET_BORRADO'`,
      [ticketId, AUTOR],
    );
  }, 120_000);

  afterAll(async () => {
    await pool?.end().catch(() => undefined);
    await admin.dropDatabase(DB);
  }, 60_000);

  it('rollback.sql conserva el historial y el tipo que lo referencia; quita solo el que nadie usa', async () => {
    expect(await historial()).toEqual(['TICKET_BORRADO']);

    await pool.query(leer('rollback.sql'));

    expect(await historial()).toEqual(['TICKET_BORRADO']);
    expect(await codigosDelCatalogo()).toEqual(['TICKET_BORRADO']);
    // El ticket sigue borrado: el rollback no lo recupera.
    const ticket = await pool.query<{ borrado: boolean }>(
      `SELECT deleted_at IS NOT NULL AS borrado FROM tickets WHERE id = $1`,
      [ticketId],
    );
    expect(ticket.rows[0]!.borrado).toBe(true);
  });

  it('rollback.sql es re-ejecutable y la migración se reaplica sin duplicar el catálogo', async () => {
    await pool.query(leer('rollback.sql'));
    expect(await historial()).toEqual(['TICKET_BORRADO']);

    await pool.query(leer('migration.sql'));
    await pool.query(leer('migration.sql'));

    expect(await codigosDelCatalogo()).toEqual(['TICKET_BORRADO', 'TICKET_RECUPERADO']);
    expect(await historial()).toEqual(['TICKET_BORRADO']);
  });
});
