/**
 * [INTEGRATION] Migración `20261014120000_retiro_subtareas_edilicia` (odd/tareas-con-tecnico T8):
 * borra `subtareas_edilicia`, `ticket_edilicia.personal_asignado_id` y
 * `ticket_edilicia.porcentaje_avance`, y su `rollback.sql` es re-ejecutable, recrea lo borrado y
 * lo repuebla desde `tareas_ticket`.
 *
 * Estrategia (mismo patrón que `migracion-tareas-ticket.integration.spec.ts`): base de inquilino
 * EFÍMERA migrada hasta `ULTIMA_CARPETA_PREVIA`, con tareas en dos reparaciones y en un ticket que
 * no es de Edilicia; después se corren el `migration.sql` y el `rollback.sql` reales.
 * No toca master: sin `usarLockMasterTest()`. Higiene: cerrar pool -> dropDatabase.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { PostgresAdminService } from '../../../../clientes/infrastructure/postgres-admin.service';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../../../prisma_tenant/migrations');
// Última carpeta ANTES de la migración bajo test: todo lo posterior queda afuera.
const ULTIMA_CARPETA_PREVIA = '20261013160000_tareas_ticket_indice_tecnico';
const CARPETA = path.join(MIGRATIONS_DIR, '20261014120000_retiro_subtareas_edilicia');
const DB = `soporte_migr_retiro_${randomBytes(4).toString('hex')}_test`;

const SOLICITANTE = '01900000-0000-7000-8000-000000000301';
const COMPLETADOR = '01900000-0000-7000-8000-000000000302';
const TECNICO = '01900000-0000-7000-8000-000000000303';

const leer = (archivo: string): string => fs.readFileSync(path.join(CARPETA, archivo), 'utf8');

describe('Migración 20261014120000_retiro_subtareas_edilicia', () => {
  const admin = new PostgresAdminService(MASTER_TEST_URL);
  let pool: InstanceType<typeof Pool>;
  let repA: string;
  let repB: string;
  let repSinTareas: string;
  let ticketSoporte: string;

  async function insertarTicket(numero: string, ids: readonly string[]): Promise<string> {
    const r = await pool.query<{ id: string }>(
      `INSERT INTO tickets (numero, titulo, tipo_id, estado_id, prioridad_id, solicitante_id, updated_at)
       VALUES ($1, 'Ticket', $2, $3, $4, $5, now()) RETURNING id`,
      [numero, ...ids, SOLICITANTE],
    );
    return r.rows[0]!.id;
  }

  async function insertarReparacion(ticketId: string): Promise<string> {
    const r = await pool.query<{ id: string }>(
      `INSERT INTO ticket_edilicia (ticket_id, updated_at) VALUES ($1, now()) RETURNING id`,
      [ticketId],
    );
    return r.rows[0]!.id;
  }

  async function insertarTarea(
    ticketId: string,
    orden: number,
    estado: { completada?: boolean; borrada?: boolean; tecnico?: boolean } = {},
  ): Promise<void> {
    await pool.query(
      `INSERT INTO tareas_ticket
         (ticket_id, descripcion, orden, tecnico_id, completada, completada_en, completada_por_id,
          created_at, updated_at, deleted_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, '2026-10-01T10:00:00Z', '2026-10-02T11:30:00.123456Z', $8)`,
      [
        ticketId,
        `Tarea ${orden}`,
        orden,
        estado.tecnico ? TECNICO : null,
        estado.completada === true,
        estado.completada ? '2026-10-03T08:15:30.5Z' : null,
        estado.completada ? COMPLETADOR : null,
        estado.borrada ? '2026-10-04T09:00:00Z' : null,
      ],
    );
  }

  const existe = async (relacion: string): Promise<boolean> =>
    (await pool.query(`SELECT to_regclass($1) IS NOT NULL AS existe`, [relacion])).rows[0].existe;

  const columnasViejas = async (): Promise<string[]> =>
    (
      await pool.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
          WHERE table_name = 'ticket_edilicia'
            AND column_name IN ('personal_asignado_id', 'porcentaje_avance')
          ORDER BY column_name`,
      )
    ).rows.map((r) => r.column_name);

  const avance = async (reparacionId: string): Promise<string> =>
    (
      await pool.query(`SELECT porcentaje_avance FROM ticket_edilicia WHERE id = $1`, [
        reparacionId,
      ])
    ).rows[0].porcentaje_avance;

  beforeAll(async () => {
    await admin.createDatabase(DB);
    pool = new Pool({ connectionString: new PrismaService(MASTER_TEST_URL).buildTenantUrl(DB) });

    const carpetas = fs
      .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name <= ULTIMA_CARPETA_PREVIA)
      .map((e) => e.name)
      .sort();
    for (const carpeta of carpetas) {
      await pool.query(
        fs.readFileSync(path.join(MIGRATIONS_DIR, carpeta, 'migration.sql'), 'utf8'),
      );
    }

    const tipo = await pool.query<{ id: string }>(
      `INSERT INTO tipos_ticket (codigo, nombre, modulo, updated_at)
       VALUES ('T-RETIRO', 'Retiro', 'EDILICIA', now()) RETURNING id`,
    );
    const estado = await pool.query<{ id: string }>(
      `INSERT INTO estados (codigo, nombre, updated_at) VALUES ('E-RETIRO', 'Abierto', now()) RETURNING id`,
    );
    const prioridad = await pool.query<{ id: string }>(
      `INSERT INTO prioridades (codigo, nombre, updated_at) VALUES ('P-RETIRO', 'Media', now()) RETURNING id`,
    );
    const ids = [tipo.rows[0]!.id, estado.rows[0]!.id, prioridad.rows[0]!.id] as const;

    const ticketA = await insertarTicket('RET-1', ids);
    const ticketB = await insertarTicket('RET-2', ids);
    repA = await insertarReparacion(ticketA);
    repB = await insertarReparacion(ticketB);
    repSinTareas = await insertarReparacion(await insertarTicket('RET-3', ids));
    ticketSoporte = await insertarTicket('RET-4', ids); // sin satélite de Edilicia

    // A: 1 de 3 activas completada (33.33 %), más una completada dada de baja que no cuenta.
    await insertarTarea(ticketA, 1, { completada: true, tecnico: true });
    await insertarTarea(ticketA, 2, { tecnico: true });
    await insertarTarea(ticketA, 3);
    await insertarTarea(ticketA, 4, { completada: true, borrada: true });
    // B: todas las activas completadas (100 %).
    await insertarTarea(ticketB, 0, { completada: true });
    // Ticket sin reparación: la tabla vieja no puede guardarlas.
    await insertarTarea(ticketSoporte, 0, { completada: true });

    await pool.query(leer('migration.sql'));
  }, 120_000);

  afterAll(async () => {
    await pool?.end().catch(() => undefined);
    await admin.dropDatabase(DB);
  }, 60_000);

  it('borra la tabla, las dos columnas, su índice y su CHECK, sin tocar tareas_ticket', async () => {
    expect(await existe('public.subtareas_edilicia')).toBe(false);
    expect(await columnasViejas()).toEqual([]);
    expect(await existe('public.ticket_edilicia_porcentaje_avance_idx')).toBe(false);
    const check = await pool.query(
      `SELECT 1 FROM pg_constraint WHERE conname = 'ticket_edilicia_porcentaje_avance_check'`,
    );
    expect(check.rows).toEqual([]);
    expect(Number((await pool.query(`SELECT count(*) AS n FROM tareas_ticket`)).rows[0].n)).toBe(6);
  });

  it('rollback.sql corre dos veces y repuebla desde tareas_ticket, con sus ids y el avance', async () => {
    await pool.query(leer('rollback.sql'));
    await pool.query(leer('rollback.sql'));

    expect(await columnasViejas()).toEqual(['personal_asignado_id', 'porcentaje_avance']);
    expect(await existe('public.subtareas_edilicia_ticket_edilicia_id_idx')).toBe(true);
    expect(await existe('public.ticket_edilicia_porcentaje_avance_idx')).toBe(true);

    // Las tareas de las reparaciones, con los mismos datos; ni el ticket sin satélite ni duplicados.
    const origen = `SELECT t.id, te.id AS ticket_edilicia_id, t.descripcion, t.completada,
                           t.completada_en, t.completada_por_id, t.orden, t.created_at,
                           t.updated_at, t.deleted_at
                      FROM tareas_ticket t JOIN ticket_edilicia te ON te.ticket_id = t.ticket_id`;
    const destino = `SELECT id, ticket_edilicia_id, descripcion, completada, completada_en,
                            completada_por_id, orden, created_at, updated_at, deleted_at
                       FROM subtareas_edilicia`;
    expect((await pool.query(`${origen} EXCEPT ${destino}`)).rows).toEqual([]);
    expect((await pool.query(`${destino} EXCEPT ${origen}`)).rows).toEqual([]);
    expect(
      Number((await pool.query(`SELECT count(*) AS n FROM subtareas_edilicia`)).rows[0].n),
    ).toBe(5);

    expect(await avance(repA)).toBe('33.33');
    expect(await avance(repB)).toBe('100.00');
    expect(await avance(repSinTareas)).toBe('0.00');
    const personal = await pool.query(
      `SELECT count(*) AS n FROM ticket_edilicia WHERE personal_asignado_id IS NOT NULL`,
    );
    expect(personal.rows[0].n).toBe('0');
  });

  it('después del rollback el CHECK de avance vuelve a regir y la migración se reaplica', async () => {
    await expect(
      pool.query(`UPDATE ticket_edilicia SET porcentaje_avance = 101 WHERE id = $1`, [repA]),
    ).rejects.toThrow(/ticket_edilicia_porcentaje_avance_check/);

    await pool.query(leer('migration.sql'));
    expect(await existe('public.subtareas_edilicia')).toBe(false);
    expect(await columnasViejas()).toEqual([]);
  });
});
