/**
 * [INTEGRATION] Migración `20261025150000_retiro_satelite_edilicia` (odd/tasks/ticket-unificado.md,
 * T4b, L37 y L41) y su `rollback.sql`, sobre una base de inquilino EFÍMERA migrada hasta
 * `ULTIMA_CARPETA_PREVIA`.
 *
 * Verifica:
 * - un comentario de reparación sin copia en el timeline aborta sin borrar nada;
 * - un dependiente desconocido de las tablas (una vista) aborta en vez de caer con ellas;
 * - con las copias completas, borra las tres tablas, avisa los vínculos y ubicaciones sin par, y no
 *   toca los datos del ticket;
 * - correrla dos veces da lo mismo, y corre en un tenant que ya no tiene las tablas;
 * - el rollback recrea las tablas como proyección del ticket, es re-ejecutable y la migración se
 *   puede volver a aplicar después.
 *
 * Mismo patrón que `migracion-ticket-unificado.integration.spec.ts`. No toca master: sin
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
const ULTIMA_CARPETA_PREVIA = '20261025140000_historial_valor_residual';
const CARPETA = path.join(MIGRATIONS_DIR, '20261025150000_retiro_satelite_edilicia');
const DB = `soporte_migr_retiro_sat_${randomBytes(4).toString('hex')}_test`;

const SOLICITANTE = '01900000-0000-7000-8000-000000000601';
const AUTOR = '01900000-0000-7000-8000-000000000602';
const TABLAS = ['ticket_edilicia', 'comentarios_reparacion', 'reparacion_compra'] as const;

/**
 * El DDL de las tres tablas leído del catálogo: columnas, constraints e índices. Compara el rollback
 * contra el estado real de antes del borrado, no contra el texto de las migraciones.
 */
const CATALOGO = `
  SELECT conrelid::regclass::text || ' ' || conname || ' ' || pg_get_constraintdef(oid) AS v
    FROM pg_constraint
   WHERE conrelid::regclass::text IN ('ticket_edilicia', 'comentarios_reparacion', 'reparacion_compra')
  UNION ALL
  SELECT tablename || ' ' || indexdef FROM pg_indexes
   WHERE tablename IN ('ticket_edilicia', 'comentarios_reparacion', 'reparacion_compra')
  UNION ALL
  SELECT table_name || '.' || column_name || ' ' || data_type || ' ' ||
         COALESCE(character_maximum_length::text, '') || ' ' || is_nullable || ' ' ||
         COALESCE(column_default, '')
    FROM information_schema.columns
   WHERE table_name IN ('ticket_edilicia', 'comentarios_reparacion', 'reparacion_compra')
  ORDER BY 1`;

const leer = (archivo: string): string => fs.readFileSync(path.join(CARPETA, archivo), 'utf8');

describe('Migración 20261025150000_retiro_satelite_edilicia', () => {
  const admin = new PostgresAdminService(MASTER_TEST_URL);
  let pool: InstanceType<typeof Pool>;
  let estadoId: string;
  let prioridadId: string;
  let cicloId: string;
  let tipoComentarioId: string;
  let secuencia = 0;
  let catalogoPrevio: unknown[];

  /** Ids de los fixtures que los `it` comparten. */
  const f = {
    edilicia: { ticket: '', satelite: '' },
    mantenimiento: { ticket: '', satelite: '' },
    ediliciaSinSatelite: '',
    soporte: '',
    compraA: '',
    compraB: '',
    vinculoTicket: '',
    comentario: '',
  };

  async function uno<T>(sql: string, params: unknown[] = []): Promise<T> {
    const r = await pool.query(sql, params);
    return r.rows[0] as T;
  }

  async function insertarTipo(codigo: string, modulo: string): Promise<string> {
    return (
      await uno<{ id: string }>(
        `INSERT INTO tipos_ticket (codigo, nombre, modulo, updated_at) VALUES ($1, $1, $2, now()) RETURNING id`,
        [codigo, modulo],
      )
    ).id;
  }

  async function insertarTicket(tipoId: string, ubicacion: string | null): Promise<string> {
    secuencia += 1;
    return (
      await uno<{ id: string }>(
        `INSERT INTO tickets (numero, titulo, tipo_id, estado_id, prioridad_id, solicitante_id, ubicacion, updated_at)
         VALUES ($1, 'Ticket', $2, $3, $4, $5, $6, now()) RETURNING id`,
        [`RET-${secuencia}`, tipoId, estadoId, prioridadId, SOLICITANTE, ubicacion],
      )
    ).id;
  }

  async function insertarSatelite(ticketId: string, ubicacion: string | null): Promise<string> {
    return (
      await uno<{ id: string }>(
        `INSERT INTO ticket_edilicia (ticket_id, ubicacion, updated_at) VALUES ($1, $2, now()) RETURNING id`,
        [ticketId, ubicacion],
      )
    ).id;
  }

  async function insertarCompra(): Promise<string> {
    secuencia += 1;
    return (
      await uno<{ id: string }>(
        `INSERT INTO compras (numero, fecha_solicitud, motivo, solicitante_id, ciclo_id, updated_at)
         VALUES ($1, '2026-10-01', 'Repuesto', $2, $3, now()) RETURNING id`,
        [`COM-2026-R${String(secuencia).padStart(4, '0')}`, SOLICITANTE, cicloId],
      )
    ).id;
  }

  const existe = async (relacion: string): Promise<boolean> =>
    (await uno<{ existe: boolean }>(`SELECT to_regclass($1) IS NOT NULL AS existe`, [relacion]))
      .existe;

  const tablasPresentes = async (): Promise<string[]> => {
    const presentes: string[] = [];
    for (const tabla of TABLAS) if (await existe(tabla)) presentes.push(tabla);
    return presentes;
  };

  /** Lo que el ticket guarda como fuente: no puede cambiar al borrar el satélite. */
  const datosDelTicket = async () => ({
    compras: (
      await pool.query(`SELECT id, ticket_id, compra_id, created_at FROM ticket_compra ORDER BY id`)
    ).rows,
    ubicaciones: (await pool.query(`SELECT id, ubicacion FROM tickets ORDER BY id`)).rows,
    timeline: (
      await pool.query(
        `SELECT id, ticket_id, descripcion, es_interno FROM operaciones_ticket ORDER BY id`,
      )
    ).rows,
  });

  /**
   * Corre la migración en un cliente propio para capturar sus `RAISE NOTICE`. Se quedan solo los
   * propios: Postgres avisa además cada `DROP TABLE IF EXISTS` sobre una tabla que ya no está.
   */
  async function migrarCapturandoAvisos(): Promise<string[]> {
    const cliente = await pool.connect();
    const avisos: string[] = [];
    cliente.on('notice', (aviso) => avisos.push(aviso.message ?? ''));
    try {
      await cliente.query(leer('migration.sql'));
    } finally {
      cliente.release();
    }
    return avisos.filter((aviso) => aviso.startsWith('retiro_satelite_edilicia:'));
  }

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

    catalogoPrevio = (await pool.query(CATALOGO)).rows;

    estadoId = (
      await uno<{ id: string }>(
        `INSERT INTO estados (codigo, nombre, updated_at) VALUES ('E-RET', 'Abierto', now()) RETURNING id`,
      )
    ).id;
    prioridadId = (
      await uno<{ id: string }>(
        `INSERT INTO prioridades (codigo, nombre, updated_at) VALUES ('P-RET', 'Media', now()) RETURNING id`,
      )
    ).id;
    cicloId = (
      await uno<{ id: string }>(
        `INSERT INTO ciclos_cliente (ciclo_vigente_id, nombre, fecha_inicio, fecha_fin, activo, updated_at)
         VALUES ($1, 'Ciclo', '2026-01-01', '2026-12-31', false, now()) RETURNING id`,
        [SOLICITANTE],
      )
    ).id;
    tipoComentarioId = (
      await uno<{ id: string }>(
        `INSERT INTO tipo_operacion (codigo, nombre, updated_at) VALUES ('COMENTARIO', 'Comentario', now()) RETURNING id`,
      )
    ).id;

    const tipoEdilicia = await insertarTipo('EDILICIA', 'EDILICIA');
    const tipoMantenimiento = await insertarTipo('MANTENIMIENTO', 'EDILICIA');
    const tipoSoporte = await insertarTipo('SOPORTE', 'SOPORTE');

    // Satélite con ubicación que el ticket ya no tiene: el usuario la vació después de la copia.
    f.edilicia.ticket = await insertarTicket(tipoEdilicia, null);
    f.edilicia.satelite = await insertarSatelite(f.edilicia.ticket, 'Aula 3');
    f.mantenimiento.ticket = await insertarTicket(tipoMantenimiento, 'Patio');
    f.mantenimiento.satelite = await insertarSatelite(f.mantenimiento.ticket, 'Patio');
    // Creado después de T4a: sin satélite.
    f.ediliciaSinSatelite = await insertarTicket(tipoEdilicia, 'Depósito');
    f.soporte = await insertarTicket(tipoSoporte, null);

    f.compraA = await insertarCompra();
    f.compraB = await insertarCompra();
    // compraA: vínculo copiado (mismo par en las dos tablas, mismo id).
    f.vinculoTicket = (
      await uno<{ id: string }>(
        `INSERT INTO ticket_compra (ticket_id, compra_id, created_at) VALUES ($1, $2, '2026-09-01T10:00:00Z') RETURNING id`,
        [f.edilicia.ticket, f.compraA],
      )
    ).id;
    await pool.query(
      `INSERT INTO reparacion_compra (id, ticket_edilicia_id, compra_id, created_at) VALUES ($1, $2, $3, '2026-09-01T10:00:00Z')`,
      [f.vinculoTicket, f.edilicia.satelite, f.compraA],
    );
    // compraB: desvinculada desde el ticket después de la copia; solo queda en la tabla vieja.
    await pool.query(
      `INSERT INTO reparacion_compra (ticket_edilicia_id, compra_id) VALUES ($1, $2)`,
      [f.edilicia.satelite, f.compraB],
    );

    f.comentario = (
      await uno<{ id: string }>(
        `INSERT INTO comentarios_reparacion (ticket_edilicia_id, texto, autor_id) VALUES ($1, 'Falta el repuesto', $2) RETURNING id`,
        [f.edilicia.satelite, AUTOR],
      )
    ).id;
  }, 120_000);

  afterAll(async () => {
    await pool.end().catch(() => undefined);
    await admin.dropDatabase(DB);
  }, 60_000);

  it('con un comentario de reparación sin copia en el timeline, aborta sin borrar nada', async () => {
    await expect(pool.query(leer('migration.sql'))).rejects.toThrow(
      'retiro_satelite_edilicia: 1 comentario(s) de reparacion sin copia en operaciones_ticket; no se borra nada.',
    );
    expect(await tablasPresentes()).toEqual([...TABLAS]);
  });

  it('con un dependiente desconocido de las tablas, aborta en vez de llevárselo', async () => {
    // La copia que hizo 20261024120000: mismo id, en el timeline, interno desde 20261024130000.
    await pool.query(
      `INSERT INTO operaciones_ticket (id, ticket_id, tipo_operacion_id, descripcion, autor_id, es_interno, created_at, updated_at)
       VALUES ($1, $2, $3, 'Falta el repuesto', $4, true, now(), now())`,
      [f.comentario, f.edilicia.ticket, tipoComentarioId, AUTOR],
    );
    await pool.query(`CREATE VIEW vista_satelite AS SELECT id FROM ticket_edilicia`);

    await expect(pool.query(leer('migration.sql'))).rejects.toThrow(/depend/);
    expect(await tablasPresentes()).toEqual([...TABLAS]);

    await pool.query(`DROP VIEW vista_satelite`);
  });

  it('con las copias completas, borra las tres tablas, avisa lo que no tiene par y no toca el ticket', async () => {
    const antes = await datosDelTicket();

    const avisos = await migrarCapturandoAvisos();

    expect(await tablasPresentes()).toEqual([]);
    expect(await datosDelTicket()).toEqual(antes);
    expect(avisos).toEqual([
      'retiro_satelite_edilicia: 1 vinculo(s) de reparacion_compra sin par en ticket_compra (desvinculados despues de la copia).',
      'retiro_satelite_edilicia: 1 satelite(s) con ubicacion que el ticket no tiene (vaciada despues de la copia).',
    ]);
  });

  it('correrla otra vez, o en un tenant sin las tablas, no falla ni avisa', async () => {
    const antes = await datosDelTicket();

    expect(await migrarCapturandoAvisos()).toEqual([]);

    expect(await tablasPresentes()).toEqual([]);
    expect(await datosDelTicket()).toEqual(antes);
  });

  it('el rollback recrea las tablas como proyección del ticket: satélite por ticket del módulo y sus compras', async () => {
    const antes = await datosDelTicket();

    await pool.query(leer('rollback.sql'));
    await pool.query(leer('rollback.sql')); // re-ejecutable

    expect(await tablasPresentes()).toEqual([...TABLAS]);
    const satelites = (
      await pool.query<{ ticket_id: string; ubicacion: string | null }>(
        `SELECT ticket_id, ubicacion FROM ticket_edilicia ORDER BY ticket_id`,
      )
    ).rows;
    expect(satelites).toEqual(
      [f.edilicia.ticket, f.mantenimiento.ticket, f.ediliciaSinSatelite]
        .sort()
        .map((ticket_id) => ({ ticket_id, ubicacion: null })),
    );

    const vinculos = (
      await pool.query<{ id: string; ticket_id: string; compra_id: string }>(
        `SELECT rc.id, te.ticket_id, rc.compra_id
           FROM reparacion_compra rc JOIN ticket_edilicia te ON te.id = rc.ticket_edilicia_id`,
      )
    ).rows;
    expect(vinculos).toEqual([
      { id: f.vinculoTicket, ticket_id: f.edilicia.ticket, compra_id: f.compraA },
    ]);
    expect(
      (await uno<{ n: number }>(`SELECT count(*)::int AS n FROM comentarios_reparacion`)).n,
    ).toBe(0);
    expect((await pool.query(CATALOGO)).rows).toEqual(catalogoPrevio);
    expect(await datosDelTicket()).toEqual(antes);
  });

  it('después del rollback, se vuelve a aplicar, también en un tenant al que le falta una de las tablas', async () => {
    await pool.query(`DROP TABLE comentarios_reparacion`);

    expect(await migrarCapturandoAvisos()).toEqual([]);
    expect(await tablasPresentes()).toEqual([]);
  });
});
