/**
 * [INTEGRATION] Migración `20261024120000_ticket_unificado` (odd/tasks/ticket-unificado.md, T1, S1 y
 * S3) y su `rollback.sql`, sobre una base de inquilino EFÍMERA migrada hasta `ULTIMA_CARPETA_PREVIA`.
 *
 * Verifica, fila por fila:
 * - sin el tipo de operación COMENTARIO y con comentarios para copiar, falla sin dejar nada a medias;
 * - los vínculos de `reparacion_compra` pasan a `ticket_compra` con id, ticket, compra y fecha;
 * - la ubicación del satélite pasa al ticket solo si el ticket no tiene una (gana el ticket);
 * - los comentarios pasan al timeline como COMENTARIO público, con id, autor, texto y fecha;
 * - correrla dos veces da lo mismo;
 * - el rollback deja las tablas viejas como proyección de las nuevas, con sus límites documentados,
 *   es re-ejecutable y la migración se puede volver a aplicar después.
 *
 * Mismo patrón que `migracion-retiro-subtareas.integration.spec.ts`. No toca master: sin
 * `usarLockMasterTest()`. Higiene: cerrar pool -> dropDatabase.
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
const ULTIMA_CARPETA_PREVIA = '20261022120000_tipos_operacion_borrado';
const CARPETA = path.join(MIGRATIONS_DIR, '20261024120000_ticket_unificado');
const DB = `soporte_migr_unificado_${randomBytes(4).toString('hex')}_test`;

const SOLICITANTE = '01900000-0000-7000-8000-000000000501';
const AUTOR_A = '01900000-0000-7000-8000-000000000502';
const AUTOR_B = '01900000-0000-7000-8000-000000000503';

const leer = (archivo: string): string => fs.readFileSync(path.join(CARPETA, archivo), 'utf8');

describe('Migración 20261024120000_ticket_unificado', () => {
  const admin = new PostgresAdminService(MASTER_TEST_URL);
  let pool: InstanceType<typeof Pool>;
  let ids: readonly [string, string, string];
  let cicloId: string;
  let compraSecuencia = 0;

  /** Ids de los fixtures que los `it` comparten. */
  const f = {
    conVinculos: { ticket: '', satelite: '' },
    soloSatelite: { ticket: '', satelite: '' },
    ambas: { ticket: '', satelite: '' },
    ticketEnBlanco: { ticket: '', satelite: '' },
    sateliteEnBlanco: { ticket: '', satelite: '' },
    sinSatelite: '',
    compraA: '',
    compraB: '',
    vinculoA: '',
    vinculoB: '',
    comentarioViejo: '',
    comentarioNuevo: '',
    comentarioDelTicket: '',
  };

  async function uno<T>(sql: string, params: unknown[] = []): Promise<T> {
    const r = await pool.query(sql, params);
    return r.rows[0] as T;
  }

  async function insertarTicket(numero: string, ubicacion: string | null): Promise<string> {
    return (
      await uno<{ id: string }>(
        `INSERT INTO tickets (numero, titulo, tipo_id, estado_id, prioridad_id, solicitante_id, ubicacion, updated_at)
         VALUES ($1, 'Ticket', $2, $3, $4, $5, $6, now()) RETURNING id`,
        [numero, ...ids, SOLICITANTE, ubicacion],
      )
    ).id;
  }

  async function insertarConSatelite(
    numero: string,
    ubicacionTicket: string | null,
    ubicacionSatelite: string | null,
  ): Promise<{ ticket: string; satelite: string }> {
    const ticket = await insertarTicket(numero, ubicacionTicket);
    const satelite = (
      await uno<{ id: string }>(
        `INSERT INTO ticket_edilicia (ticket_id, ubicacion, updated_at) VALUES ($1, $2, now()) RETURNING id`,
        [ticket, ubicacionSatelite],
      )
    ).id;
    return { ticket, satelite };
  }

  async function insertarCompra(): Promise<string> {
    compraSecuencia += 1;
    return (
      await uno<{ id: string }>(
        `INSERT INTO compras (numero, fecha_solicitud, motivo, solicitante_id, ciclo_id, updated_at)
         VALUES ($1, '2026-10-01', 'Repuesto', $2, $3, now()) RETURNING id`,
        [`COM-2026-U${String(compraSecuencia).padStart(4, '0')}`, SOLICITANTE, cicloId],
      )
    ).id;
  }

  const existe = async (relacion: string): Promise<boolean> =>
    (await uno<{ existe: boolean }>(`SELECT to_regclass($1) IS NOT NULL AS existe`, [relacion]))
      .existe;

  const ubicacionDe = async (tabla: 'tickets' | 'ticket_edilicia', id: string) =>
    (await uno<{ ubicacion: string | null }>(`SELECT ubicacion FROM ${tabla} WHERE id = $1`, [id]))
      .ubicacion;

  const vinculosTicket = async () =>
    (
      await pool.query<{ id: string; ticket_id: string; compra_id: string; created_at: Date }>(
        `SELECT id, ticket_id, compra_id, created_at FROM ticket_compra ORDER BY id`,
      )
    ).rows;

  const vinculosViejos = async () =>
    (
      await pool.query<{ ticket_edilicia_id: string; compra_id: string }>(
        `SELECT ticket_edilicia_id, compra_id FROM reparacion_compra ORDER BY compra_id`,
      )
    ).rows;

  const comentariosDelTimeline = async () =>
    (
      await pool.query<{
        id: string;
        ticket_id: string;
        codigo: string;
        descripcion: string;
        autor_id: string;
        es_interno: boolean;
        created_at: Date;
        updated_at: Date;
      }>(
        `SELECT o.id, o.ticket_id, t.codigo, o.descripcion, o.autor_id, o.es_interno,
                o.created_at, o.updated_at
           FROM operaciones_ticket o JOIN tipo_operacion t ON t.id = o.tipo_operacion_id
          ORDER BY o.created_at`,
      )
    ).rows;

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

    const tipo = await uno<{ id: string }>(
      `INSERT INTO tipos_ticket (codigo, nombre, modulo, updated_at)
       VALUES ('T-UNIF', 'Edilicia', 'EDILICIA', now()) RETURNING id`,
    );
    const estado = await uno<{ id: string }>(
      `INSERT INTO estados (codigo, nombre, updated_at) VALUES ('E-UNIF', 'Abierto', now()) RETURNING id`,
    );
    const prioridad = await uno<{ id: string }>(
      `INSERT INTO prioridades (codigo, nombre, updated_at) VALUES ('P-UNIF', 'Media', now()) RETURNING id`,
    );
    ids = [tipo.id, estado.id, prioridad.id];
    cicloId = (
      await uno<{ id: string }>(
        `INSERT INTO ciclos_cliente (ciclo_vigente_id, nombre, fecha_inicio, fecha_fin, activo, updated_at)
         VALUES ($1, 'Ciclo', '2026-01-01', '2026-12-31', false, now()) RETURNING id`,
        [SOLICITANTE],
      )
    ).id;

    f.conVinculos = await insertarConSatelite('UNI-1', null, null);
    f.soloSatelite = await insertarConSatelite('UNI-2', null, 'Aula 3');
    f.ambas = await insertarConSatelite('UNI-3', 'Depósito', 'Aula 9');
    f.ticketEnBlanco = await insertarConSatelite('UNI-4', '  ', 'Patio');
    f.sateliteEnBlanco = await insertarConSatelite('UNI-5', null, '   ');
    f.sinSatelite = await insertarTicket('UNI-6', 'Oficina');

    f.compraA = await insertarCompra();
    f.compraB = await insertarCompra();
    f.vinculoA = (
      await uno<{ id: string }>(
        `INSERT INTO reparacion_compra (ticket_edilicia_id, compra_id, created_at)
         VALUES ($1, $2, '2026-09-01T10:00:00Z') RETURNING id`,
        [f.conVinculos.satelite, f.compraA],
      )
    ).id;
    f.vinculoB = (
      await uno<{ id: string }>(
        `INSERT INTO reparacion_compra (ticket_edilicia_id, compra_id, created_at)
         VALUES ($1, $2, '2026-09-02T11:00:00Z') RETURNING id`,
        [f.conVinculos.satelite, f.compraB],
      )
    ).id;

    f.comentarioViejo = (
      await uno<{ id: string }>(
        `INSERT INTO comentarios_reparacion (ticket_edilicia_id, texto, autor_id, created_at)
         VALUES ($1, 'Falta el repuesto X', $2, '2026-09-03T08:00:00.123Z') RETURNING id`,
        [f.conVinculos.satelite, AUTOR_A],
      )
    ).id;
    f.comentarioNuevo = (
      await uno<{ id: string }>(
        `INSERT INTO comentarios_reparacion (ticket_edilicia_id, texto, autor_id, created_at)
         VALUES ($1, 'Llegó el repuesto', $2, '2026-09-04T09:30:00Z') RETURNING id`,
        [f.soloSatelite.satelite, AUTOR_B],
      )
    ).id;
  }, 120_000);

  afterAll(async () => {
    await pool.end().catch(() => undefined);
    await admin.dropDatabase(DB);
  }, 60_000);

  it('sin el tipo COMENTARIO y con comentarios para copiar, falla sin dejar nada aplicado', async () => {
    await expect(pool.query(leer('migration.sql'))).rejects.toThrow(
      'ticket_unificado: falta el tipo de operacion COMENTARIO y hay comentarios de reparacion para copiar.',
    );

    // El script corre como una sola transacción implícita: ni la tabla ni la ubicación quedan.
    expect(await existe('ticket_compra')).toBe(false);
    expect(await ubicacionDe('tickets', f.soloSatelite.ticket)).toBeNull();
  });

  it('con el catálogo completo, copia los vínculos de compra al ticket con id, compra y fecha', async () => {
    // El catálogo del tenant lo siembra el provisioning; la base de test solo está migrada.
    await pool.query(
      `INSERT INTO tipo_operacion (codigo, nombre, updated_at) VALUES ('COMENTARIO', 'Comentario', now())`,
    );
    // Un comentario hecho desde Tickets, previo a la migración: no lo toca.
    f.comentarioDelTicket = (
      await uno<{ id: string }>(
        `INSERT INTO operaciones_ticket (ticket_id, tipo_operacion_id, descripcion, autor_id, created_at, updated_at)
         SELECT $1, id, 'Desde Tickets', $2, '2026-09-05T00:00:00Z', '2026-09-05T00:00:00Z'
           FROM tipo_operacion WHERE codigo = 'COMENTARIO' RETURNING id`,
        [f.sinSatelite, AUTOR_A],
      )
    ).id;

    await pool.query(leer('migration.sql'));

    expect(await vinculosTicket()).toEqual(
      [
        {
          id: f.vinculoA,
          ticket_id: f.conVinculos.ticket,
          compra_id: f.compraA,
          created_at: new Date('2026-09-01T10:00:00Z'),
        },
        {
          id: f.vinculoB,
          ticket_id: f.conVinculos.ticket,
          compra_id: f.compraB,
          created_at: new Date('2026-09-02T11:00:00Z'),
        },
      ].sort((a, b) => a.id.localeCompare(b.id)),
    );
    // La tabla vieja queda como estaba: T4 la retira.
    expect(await vinculosViejos()).toHaveLength(2);
  });

  it('la UNIQUE de ticket_compra rechaza el mismo par dos veces', async () => {
    await expect(
      pool.query(`INSERT INTO ticket_compra (ticket_id, compra_id) VALUES ($1, $2)`, [
        f.conVinculos.ticket,
        f.compraA,
      ]),
    ).rejects.toThrow(/ticket_compra_ticket_compra_key/);
  });

  it('la ubicación pasa al ticket solo si no tiene una propia: gana el ticket', async () => {
    expect(await ubicacionDe('tickets', f.soloSatelite.ticket)).toBe('Aula 3');
    expect(await ubicacionDe('tickets', f.ambas.ticket)).toBe('Depósito');
    // Una ubicación en blanco del ticket cuenta como vacía; una en blanco del satélite no se copia.
    expect(await ubicacionDe('tickets', f.ticketEnBlanco.ticket)).toBe('Patio');
    expect(await ubicacionDe('tickets', f.sateliteEnBlanco.ticket)).toBeNull();
    expect(await ubicacionDe('tickets', f.conVinculos.ticket)).toBeNull();
    expect(await ubicacionDe('tickets', f.sinSatelite)).toBe('Oficina');
    // El satélite no se toca.
    expect(await ubicacionDe('ticket_edilicia', f.ambas.satelite)).toBe('Aula 9');
  });

  it('los comentarios pasan al timeline como COMENTARIO público, con su id, autor, texto y fecha', async () => {
    expect(await comentariosDelTimeline()).toEqual([
      {
        id: f.comentarioViejo,
        ticket_id: f.conVinculos.ticket,
        codigo: 'COMENTARIO',
        descripcion: 'Falta el repuesto X',
        autor_id: AUTOR_A,
        es_interno: false,
        created_at: new Date('2026-09-03T08:00:00.123Z'),
        updated_at: new Date('2026-09-03T08:00:00.123Z'),
      },
      {
        id: f.comentarioNuevo,
        ticket_id: f.soloSatelite.ticket,
        codigo: 'COMENTARIO',
        descripcion: 'Llegó el repuesto',
        autor_id: AUTOR_B,
        es_interno: false,
        created_at: new Date('2026-09-04T09:30:00Z'),
        updated_at: new Date('2026-09-04T09:30:00Z'),
      },
      expect.objectContaining({ id: f.comentarioDelTicket, descripcion: 'Desde Tickets' }),
    ]);
  });

  it('es re-ejecutable: una segunda corrida deja las mismas filas', async () => {
    const antes = {
      vinculos: await vinculosTicket(),
      comentarios: await comentariosDelTimeline(),
    };

    await pool.query(leer('migration.sql'));

    expect(await vinculosTicket()).toEqual(antes.vinculos);
    expect(await comentariosDelTimeline()).toEqual(antes.comentarios);
  });

  it('el rollback proyecta el estado nuevo sobre las tablas viejas y borra ticket_compra', async () => {
    // Actividad posterior a la migración, que solo escribe en las tablas nuevas.
    await pool.query(`DELETE FROM ticket_compra WHERE id = $1`, [f.vinculoB]);
    const compraNueva = await insertarCompra();
    await pool.query(`INSERT INTO ticket_compra (ticket_id, compra_id) VALUES ($1, $2)`, [
      f.soloSatelite.ticket,
      compraNueva,
    ]);
    await pool.query(`INSERT INTO ticket_compra (ticket_id, compra_id) VALUES ($1, $2)`, [
      f.sinSatelite,
      f.compraB,
    ]);
    await pool.query(`UPDATE tickets SET ubicacion = 'Aula 7' WHERE id = $1`, [
      f.conVinculos.ticket,
    ]);
    const comentarioPosterior = (
      await uno<{ id: string }>(
        `INSERT INTO operaciones_ticket (ticket_id, tipo_operacion_id, descripcion, autor_id, updated_at)
         SELECT $1, id, 'Después de migrar', $2, now() FROM tipo_operacion WHERE codigo = 'COMENTARIO'
         RETURNING id`,
        [f.conVinculos.ticket, AUTOR_B],
      )
    ).id;

    await pool.query(leer('rollback.sql'));

    expect(await existe('ticket_compra')).toBe(false);
    // Vuelve el vínculo nuevo de un ticket con satélite; el quitado no vuelve; el de un ticket sin
    // satélite se pierde (límite documentado).
    expect(await vinculosViejos()).toEqual(
      [
        { ticket_edilicia_id: f.conVinculos.satelite, compra_id: f.compraA },
        { ticket_edilicia_id: f.soloSatelite.satelite, compra_id: compraNueva },
      ].sort((a, b) => a.compra_id.localeCompare(b.compra_id)),
    );
    // El satélite vuelve a tener la ubicación vigente del ticket.
    expect(await ubicacionDe('ticket_edilicia', f.conVinculos.satelite)).toBe('Aula 7');
    expect(await ubicacionDe('ticket_edilicia', f.ambas.satelite)).toBe('Depósito');
    expect(await ubicacionDe('ticket_edilicia', f.soloSatelite.satelite)).toBe('Aula 3');
    // Se quitan del timeline solo las copias de la migración.
    expect((await comentariosDelTimeline()).map((c) => c.id).sort()).toEqual(
      [f.comentarioDelTicket, comentarioPosterior].sort(),
    );
    expect(
      (await uno<{ total: string }>(`SELECT count(*) AS total FROM comentarios_reparacion`)).total,
    ).toBe('2');
  });

  it('el rollback es re-ejecutable y la migración se puede volver a aplicar después', async () => {
    await pool.query(leer('rollback.sql'));
    expect(await vinculosViejos()).toHaveLength(2);

    await pool.query(leer('migration.sql'));

    expect((await vinculosTicket()).map((v) => v.compra_id).sort()).toHaveLength(2);
    expect((await comentariosDelTimeline()).map((c) => c.id)).toEqual(
      expect.arrayContaining([f.comentarioViejo, f.comentarioNuevo]),
    );
  });
});
