/**
 * [INTEGRATION] Migración `20261026110000_tramos_tecnico_ticket` (odd/tasks/tiempo-tecnico.md, T3)
 * y su `rollback.sql`, sobre una base de inquilino EFÍMERA migrada con todas las carpetas
 * anteriores.
 *
 * Verifica:
 * - la tabla nace vacía, y el CHECK de `motivo_fin` enumera exactamente `MOTIVOS_FIN_TRAMO`
 *   (leído de `pg_get_constraintdef`: el array del dominio es la fuente única);
 * - a lo sumo un tramo abierto por ticket (índice único parcial `WHERE fin_at IS NULL`);
 * - los CHECK rechazan un fin anterior al inicio, un motivo desconocido, un abierto con motivo o
 *   medición, un cerrado sin motivo, segundos negativos y un `cumplido` que no sea
 *   `habil_s <= meta_s` en un tramo RESUELTO con meta y medición;
 * - borrar el ticket borra sus tramos (ON DELETE CASCADE);
 * - correrla dos veces no falla ni pierde filas; el rollback es re-ejecutable y no toca `tickets`.
 *
 * Mismo patrón que `migracion-horario-laboral-usuario.integration.spec.ts`. No toca master: sin
 * `usarLockMasterTest()`. Higiene: cerrar pool → dropDatabase.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomBytes } from 'node:crypto';
import { DatabaseError, Pool } from 'pg';
import { PostgresAdminService } from '../../clientes/infrastructure/postgres-admin.service';
import { PrismaService } from '../../shared/infrastructure/persistence/prisma.service';
import { MOTIVOS_FIN_TRAMO } from '../domain/tramo-tecnico';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../prisma_tenant/migrations');
const MIGRACION = '20261026110000_tramos_tecnico_ticket';
const CARPETA = path.join(MIGRATIONS_DIR, MIGRACION);
const DB = `soporte_migr_tramos_tecnico_${randomBytes(4).toString('hex')}_test`;

const TECNICO = '01900000-0000-7000-8000-000000000a01';
const INICIO = '2026-10-26T12:00:00Z';
const FIN = '2026-10-26T15:00:00Z';

const leer = (archivo: string): string => fs.readFileSync(path.join(CARPETA, archivo), 'utf8');

interface Tramo {
  inicio?: string;
  fin?: string | null;
  motivo?: string | null;
  habil?: number | null;
  meta?: number | null;
  cumplido?: boolean | null;
}

describe(`Migración ${MIGRACION}`, () => {
  const admin = new PostgresAdminService(MASTER_TEST_URL);
  let pool: InstanceType<typeof Pool>;
  let tipoId: string;
  let prioridadId: string;
  let estadoId: string;
  let contador = 0;

  const existe = async (relacion: string): Promise<boolean> =>
    (
      await pool.query<{ existe: boolean }>(`SELECT to_regclass($1) IS NOT NULL AS existe`, [
        relacion,
      ])
    ).rows[0].existe;

  async function crearTicket(): Promise<string> {
    contador += 1;
    return (
      await pool.query<{ id: string }>(
        `INSERT INTO tickets (id, numero, titulo, tipo_id, estado_id, prioridad_id, solicitante_id,
                              sla_regla, updated_at)
         VALUES (gen_random_uuid(), $1, 'Ticket tramos', $2, $3, $4, gen_random_uuid(), 'HABIL', now())
         RETURNING id`,
        [`TRAMOS-${contador}`, tipoId, estadoId, prioridadId],
      )
    ).rows[0].id;
  }

  function insertar(ticketId: string, t: Tramo): Promise<unknown> {
    return pool.query(
      `INSERT INTO tramos_tecnico_ticket
         (ticket_id, tecnico_id, inicio_at, fin_at, motivo_fin, habil_s, meta_s, cumplido, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())`,
      [
        ticketId,
        TECNICO,
        t.inicio ?? INICIO,
        t.fin === undefined ? FIN : t.fin,
        t.motivo === undefined ? 'RESUELTO' : t.motivo,
        t.habil === undefined ? 3600 : t.habil,
        t.meta === undefined ? 7200 : t.meta,
        t.cumplido === undefined ? true : t.cumplido,
      ],
    );
  }

  /** El error de Postgres de una inserción que debe fallar: código y constraint. */
  async function rechazo(
    ticketId: string,
    t: Tramo,
  ): Promise<{ code: string | undefined; constraint: string | undefined }> {
    try {
      await insertar(ticketId, t);
    } catch (error) {
      if (error instanceof DatabaseError) {
        return { code: error.code, constraint: error.constraint };
      }
      throw error;
    }
    throw new Error(`El tramo ${JSON.stringify(t)} no fue rechazado`);
  }

  const tramosDe = async (ticketId: string): Promise<unknown[]> =>
    (
      await pool.query(
        `SELECT tecnico_id, fin_at IS NULL AS abierto, motivo_fin, habil_s, meta_s, cumplido
           FROM tramos_tecnico_ticket WHERE ticket_id = $1 ORDER BY inicio_at, created_at`,
        [ticketId],
      )
    ).rows;

  beforeAll(async () => {
    await admin.createDatabase(DB);
    pool = new Pool({ connectionString: new PrismaService(MASTER_TEST_URL).buildTenantUrl(DB) });

    const anteriores = fs
      .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name < MIGRACION)
      .map((e) => e.name)
      .sort();
    for (const carpeta of anteriores) {
      await pool.query(
        fs.readFileSync(path.join(MIGRATIONS_DIR, carpeta, 'migration.sql'), 'utf8'),
      );
    }
    expect(await existe('tramos_tecnico_ticket')).toBe(false);

    prioridadId = (
      await pool.query<{ id: string }>(
        `INSERT INTO prioridades (id, codigo, nombre, updated_at)
         VALUES (gen_random_uuid(), 'T_TRAMOS', 'Prioridad tramos', now()) RETURNING id`,
      )
    ).rows[0].id;
    tipoId = (
      await pool.query<{ id: string }>(
        `INSERT INTO tipos_ticket (id, codigo, nombre, modulo, updated_at)
         VALUES (gen_random_uuid(), 'T_TRAMOS_SOP', 'Soporte tramos', 'SOPORTE', now()) RETURNING id`,
      )
    ).rows[0].id;
    estadoId = (
      await pool.query<{ id: string }>(
        `INSERT INTO estados (id, codigo, nombre, updated_at)
         VALUES (gen_random_uuid(), 'EN_PROCESO', 'En proceso', now())
         ON CONFLICT (codigo) DO UPDATE SET nombre = estados.nombre RETURNING id`,
      )
    ).rows[0].id;

    await pool.query(leer('migration.sql'));
  }, 120_000);

  afterAll(async () => {
    await pool.end().catch(() => undefined);
    await admin.dropDatabase(DB);
  }, 60_000);

  it('crea la tabla vacía y el CHECK de motivo_fin enumera exactamente MOTIVOS_FIN_TRAMO', async () => {
    expect((await pool.query(`SELECT 1 FROM tramos_tecnico_ticket`)).rows).toEqual([]);

    const { rows } = await pool.query<{ def: string }>(
      `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE conname = 'tramos_tecnico_ticket_motivo_fin_check'`,
    );
    expect(rows).toHaveLength(1);
    const enumerados = [...rows[0].def.matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]);
    expect(enumerados).toEqual([...MOTIVOS_FIN_TRAMO]);
  });

  it('el índice de "un tramo abierto por ticket" es único y parcial sobre fin_at IS NULL', async () => {
    const { rows } = await pool.query<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes WHERE indexname = 'tramos_tecnico_ticket_abierto_key'`,
    );
    expect(rows.map((r) => r.indexdef)).toEqual([
      'CREATE UNIQUE INDEX tramos_tecnico_ticket_abierto_key ON public.tramos_tecnico_ticket USING btree (ticket_id) WHERE (fin_at IS NULL)',
    ]);
  });

  it('acepta un abierto, cerrados con y sin veredicto, y rechaza un segundo abierto del mismo ticket', async () => {
    const ticketId = await crearTicket();
    const abierto: Tramo = { fin: null, motivo: null, habil: null, meta: null, cumplido: null };
    await insertar(ticketId, { motivo: 'REASIGNADO', cumplido: null });
    await insertar(ticketId, { motivo: 'RESUELTO', habil: 7200, meta: 7200, cumplido: true });
    await insertar(ticketId, { motivo: 'RESUELTO', habil: 7201, meta: 7200, cumplido: false });
    await insertar(ticketId, { motivo: 'RESUELTO', habil: null, cumplido: null });
    await insertar(ticketId, { motivo: 'RESUELTO', meta: null, cumplido: null });
    await insertar(ticketId, { fin: INICIO, motivo: 'CANCELADO', habil: 0, cumplido: null });
    await insertar(ticketId, abierto);

    expect(await rechazo(ticketId, abierto)).toEqual({
      code: '23505',
      constraint: 'tramos_tecnico_ticket_abierto_key',
    });
    expect(await rechazo(await crearTicket(), { ...abierto, fin: undefined })).toEqual({
      code: '23514',
      constraint: 'tramos_tecnico_ticket_cierre_check',
    });
    expect((await tramosDe(ticketId)).length).toBe(7);
  });

  it.each([
    { caso: 'fin anterior al inicio', t: { fin: '2026-10-26T11:59:59Z' }, constraint: 'fin_check' },
    {
      caso: 'motivo desconocido',
      t: { motivo: 'VENCIDO', cumplido: null },
      constraint: 'motivo_fin_check',
    },
    {
      caso: 'abierto con motivo',
      t: { fin: null, habil: null, meta: null, cumplido: null },
      constraint: 'cierre_check',
    },
    {
      caso: 'abierto con meta',
      t: { fin: null, motivo: null, habil: null, cumplido: null },
      constraint: 'cierre_check',
    },
    { caso: 'cerrado sin motivo', t: { motivo: null, cumplido: null }, constraint: 'cierre_check' },
    {
      caso: 'segundos hábiles negativos',
      t: { habil: -1, cumplido: null, motivo: 'REASIGNADO' },
      constraint: 'habil_s_check',
    },
    {
      caso: 'meta negativa',
      t: { meta: -1, cumplido: null, motivo: 'REASIGNADO' },
      constraint: 'meta_s_check',
    },
    {
      caso: 'veredicto en un tramo REASIGNADO',
      t: { motivo: 'REASIGNADO', cumplido: true },
      constraint: 'cumplido_check',
    },
    {
      caso: 'cumplido con tiempo sobre la meta',
      t: { habil: 7201, meta: 7200, cumplido: true },
      constraint: 'cumplido_check',
    },
    {
      caso: 'no cumplido con tiempo dentro de la meta',
      t: { habil: 3600, cumplido: false },
      constraint: 'cumplido_check',
    },
    {
      caso: 'RESUELTO con meta y medición sin veredicto',
      t: { cumplido: null },
      constraint: 'cumplido_check',
    },
    { caso: 'veredicto sin meta', t: { meta: null, cumplido: true }, constraint: 'cumplido_check' },
  ])('rechaza $caso con su CHECK', async ({ t, constraint }) => {
    expect(await rechazo(await crearTicket(), t)).toEqual({
      code: '23514',
      constraint: `tramos_tecnico_ticket_${constraint}`,
    });
  });

  it('borrar el ticket borra sus tramos', async () => {
    const ticketId = await crearTicket();
    await insertar(ticketId, {});

    await pool.query(`DELETE FROM tickets WHERE id = $1`, [ticketId]);

    expect(await tramosDe(ticketId)).toEqual([]);
  });

  it('correrla otra vez no falla ni pierde filas', async () => {
    const antes = (await pool.query(`SELECT * FROM tramos_tecnico_ticket ORDER BY id`)).rows;

    await pool.query(leer('migration.sql'));

    expect((await pool.query(`SELECT * FROM tramos_tecnico_ticket ORDER BY id`)).rows).toEqual(
      antes,
    );
  });

  it('el rollback borra solo esta tabla y es re-ejecutable; la migración se vuelve a aplicar', async () => {
    const tickets = (await pool.query(`SELECT id, estado_id FROM tickets ORDER BY id`)).rows;

    await pool.query(leer('rollback.sql'));
    await pool.query(leer('rollback.sql'));

    expect(await existe('tramos_tecnico_ticket')).toBe(false);
    expect((await pool.query(`SELECT id, estado_id FROM tickets ORDER BY id`)).rows).toEqual(
      tickets,
    );

    await pool.query(leer('migration.sql'));
    expect(await existe('tramos_tecnico_ticket')).toBe(true);
    expect((await pool.query(`SELECT 1 FROM tramos_tecnico_ticket`)).rows).toEqual([]);
  });
});
