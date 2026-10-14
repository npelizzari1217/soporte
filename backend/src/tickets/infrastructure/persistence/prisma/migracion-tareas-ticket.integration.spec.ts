/**
 * [INTEGRATION] Migración `20261013140000_tareas_ticket` (odd/tareas-con-tecnico T1): la copia de
 * `subtareas_edilicia` a `tareas_ticket` es completa e idempotente, y el `rollback.sql` es
 * re-ejecutable y deja la tabla vieja intacta.
 *
 * Estrategia (mismo patrón que `rollback-compras-tres-etapas.integration.spec.ts`): base de
 * inquilino EFÍMERA migrada hasta `ULTIMA_CARPETA_PREVIA`, con subtareas completadas, pendientes,
 * dadas de baja y con distinto `orden` en dos reparaciones; después se corre el `migration.sql`
 * real y se compara fila por fila.
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
const ULTIMA_CARPETA_PREVIA = '20261013130000_webhook_entregas';
const CARPETA = path.join(MIGRATIONS_DIR, '20261013140000_tareas_ticket');
const DB = `soporte_migr_tareas_${randomBytes(4).toString('hex')}_test`;

const SOLICITANTE = '01900000-0000-7000-8000-000000000201';
const COMPLETADOR = '01900000-0000-7000-8000-000000000202';

/** Columnas que la copia tiene que conservar idénticas. */
const COLUMNAS =
  'id, descripcion, orden, completada, completada_en, completada_por_id, created_at, updated_at, deleted_at';

const leer = (archivo: string): string => fs.readFileSync(path.join(CARPETA, archivo), 'utf8');

/** La sentencia de copia de `migration.sql`, tal cual, para correrla de nuevo. */
function sentenciaDeCopia(): string {
  const sql = leer('migration.sql');
  const inicio = sql.indexOf('INSERT INTO "tareas_ticket"');
  if (inicio < 0) throw new Error('migration.sql no tiene la sentencia de copia');
  return sql.slice(inicio);
}

describe('Migración 20261013140000_tareas_ticket — copia de subtareas_edilicia', () => {
  const admin = new PostgresAdminService(MASTER_TEST_URL);
  let pool: InstanceType<typeof Pool>;
  const ticketPorReparacion = new Map<string, string>();

  async function insertarTicket(
    numero: string,
    tipoId: string,
    estadoId: string,
    prioridadId: string,
  ): Promise<string> {
    const r = await pool.query<{ id: string }>(
      `INSERT INTO tickets (numero, titulo, tipo_id, estado_id, prioridad_id, solicitante_id, updated_at)
       VALUES ($1, 'Reparación', $2, $3, $4, $5, now()) RETURNING id`,
      [numero, tipoId, estadoId, prioridadId, SOLICITANTE],
    );
    return r.rows[0]!.id;
  }

  async function insertarReparacion(ticketId: string): Promise<string> {
    const r = await pool.query<{ id: string }>(
      `INSERT INTO ticket_edilicia (ticket_id, updated_at) VALUES ($1, now()) RETURNING id`,
      [ticketId],
    );
    ticketPorReparacion.set(r.rows[0]!.id, ticketId);
    return r.rows[0]!.id;
  }

  async function insertarSubtarea(
    reparacionId: string,
    descripcion: string,
    orden: number,
    estado: { completadaEn?: string; borradaEn?: string } = {},
  ): Promise<void> {
    const completada = estado.completadaEn !== undefined;
    await pool.query(
      `INSERT INTO subtareas_edilicia
         (ticket_edilicia_id, descripcion, orden, completada, completada_en, completada_por_id,
          created_at, updated_at, deleted_at)
       VALUES ($1, $2, $3, $4, $5, $6, '2026-09-01T10:00:00Z', '2026-09-02T11:30:00.123456Z', $7)`,
      [
        reparacionId,
        descripcion,
        orden,
        completada,
        estado.completadaEn ?? null,
        completada ? COMPLETADOR : null,
        estado.borradaEn ?? null,
      ],
    );
  }

  const contar = async (tabla: string): Promise<number> =>
    Number((await pool.query(`SELECT count(*) AS n FROM ${tabla}`)).rows[0].n);

  const tablaExiste = async (): Promise<boolean> =>
    (await pool.query(`SELECT to_regclass('public.tareas_ticket') IS NOT NULL AS existe`)).rows[0]
      .existe;

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
       VALUES ('T-MIGR', 'Edilicia migr', 'EDILICIA', now()) RETURNING id`,
    );
    const estado = await pool.query<{ id: string }>(
      `INSERT INTO estados (codigo, nombre, updated_at) VALUES ('E-MIGR', 'Abierto', now()) RETURNING id`,
    );
    const prioridad = await pool.query<{ id: string }>(
      `INSERT INTO prioridades (codigo, nombre, updated_at) VALUES ('P-MIGR', 'Media', now()) RETURNING id`,
    );
    const ids = [tipo.rows[0]!.id, estado.rows[0]!.id, prioridad.rows[0]!.id] as const;

    const repA = await insertarReparacion(await insertarTicket('MIG-1', ...ids));
    const repB = await insertarReparacion(await insertarTicket('MIG-2', ...ids));
    await insertarReparacion(await insertarTicket('MIG-3', ...ids)); // reparación sin subtareas

    await insertarSubtarea(repA, 'Completada', 1, { completadaEn: '2026-09-05T08:15:30.5Z' });
    await insertarSubtarea(repA, 'Pendiente', 2);
    await insertarSubtarea(repA, 'Borrada pendiente', 3, { borradaEn: '2026-09-06T09:00:00Z' });
    await insertarSubtarea(repB, 'Borrada completada', 0, {
      completadaEn: '2026-09-07T10:00:00Z',
      borradaEn: '2026-09-08T10:00:00Z',
    });
    await insertarSubtarea(repB, 'Pendiente B', 7);

    expect(await tablaExiste()).toBe(false);
    await pool.query(leer('migration.sql'));
  }, 120_000);

  afterAll(async () => {
    await pool?.end().catch(() => undefined);
    await admin.dropDatabase(DB);
  }, 60_000);

  it('copia cada subtarea con el mismo id, su ticket y datos idénticos', async () => {
    const viejas = await pool.query(
      `SELECT ${COLUMNAS}, ticket_edilicia_id FROM subtareas_edilicia ORDER BY id`,
    );
    const nuevas = await pool.query(
      `SELECT ${COLUMNAS}, ticket_id, tecnico_id FROM tareas_ticket ORDER BY id`,
    );

    expect(viejas.rows).toHaveLength(5);
    expect(nuevas.rows).toHaveLength(viejas.rows.length);
    viejas.rows.forEach((vieja, i) => {
      const { ticket_edilicia_id: reparacionId, ...datos } = vieja;
      const { ticket_id: ticketId, tecnico_id: tecnicoId, ...copiados } = nuevas.rows[i];
      expect(copiados).toEqual(datos);
      expect(ticketId).toBe(ticketPorReparacion.get(reparacionId));
      expect(tecnicoId).toBeNull();
    });
  });

  it('la diferencia en SQL es vacía en los dos sentidos (precisión de microsegundos incluida)', async () => {
    const origen = `SELECT s.id, te.ticket_id, s.descripcion, s.orden, s.completada, s.completada_en,
                           s.completada_por_id, s.created_at, s.updated_at, s.deleted_at
                      FROM subtareas_edilicia s JOIN ticket_edilicia te ON te.id = s.ticket_edilicia_id`;
    const destino = `SELECT id, ticket_id, descripcion, orden, completada, completada_en,
                            completada_por_id, created_at, updated_at, deleted_at FROM tareas_ticket`;

    expect((await pool.query(`${origen} EXCEPT ${destino}`)).rows).toEqual([]);
    expect((await pool.query(`${destino} EXCEPT ${origen}`)).rows).toEqual([]);
  });

  it('conserva completadas, pendientes y bajas lógicas', async () => {
    const r = await pool.query(
      `SELECT count(*) FILTER (WHERE completada) AS completadas,
              count(*) FILTER (WHERE deleted_at IS NOT NULL) AS borradas,
              count(*) FILTER (WHERE completada AND completada_por_id = $1) AS con_autor
         FROM tareas_ticket`,
      [COMPLETADOR],
    );

    expect(r.rows[0]).toEqual({ completadas: '2', borradas: '2', con_autor: '2' });
  });

  it('volver a correr la copia no duplica filas', async () => {
    await pool.query(sentenciaDeCopia());
    await pool.query(sentenciaDeCopia());

    expect(await contar('tareas_ticket')).toBe(await contar('subtareas_edilicia'));
  });

  it('rollback.sql borra solo la tabla nueva, es re-ejecutable y la migración se reaplica', async () => {
    await pool.query(leer('rollback.sql'));
    expect(await tablaExiste()).toBe(false);
    await pool.query(leer('rollback.sql'));
    expect(await tablaExiste()).toBe(false);
    expect(await contar('subtareas_edilicia')).toBe(5);

    await pool.query(leer('migration.sql'));
    expect(await contar('tareas_ticket')).toBe(5);
  });
});
