/**
 * [INTEGRATION] Migración `20261024130000_comentarios_reparacion_internos` (odd/tasks/ticket-unificado.md,
 * T2b, S3, decisión L19) y su `rollback.sql`, sobre una base de inquilino EFÍMERA migrada hasta
 * `20261024120000_ticket_unificado` inclusive.
 *
 * Verifica, fila por fila:
 * - las copias de los comentarios de reparación (mismo id que una fila de `comentarios_reparacion`)
 *   pasan a internas, y los comentarios hechos desde Tickets, públicos o internos, no se tocan;
 * - correrla dos veces da lo mismo;
 * - el rollback las devuelve a públicas sin tocar el resto, es re-ejecutable y la migración se puede
 *   volver a aplicar después.
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
// Última carpeta ANTES de la que copia los comentarios: los fixtures se cargan en el esquema viejo.
const ULTIMA_CARPETA_ANTES_DE_LA_COPIA = '20261022120000_tipos_operacion_borrado';
const CARPETA_COPIA = path.join(MIGRATIONS_DIR, '20261024120000_ticket_unificado');
const CARPETA = path.join(MIGRATIONS_DIR, '20261024130000_comentarios_reparacion_internos');
const DB = `soporte_migr_coment_int_${randomBytes(4).toString('hex')}_test`;

const SOLICITANTE = '01900000-0000-7000-8000-000000000601';
const AUTOR = '01900000-0000-7000-8000-000000000602';

const leer = (archivo: string): string => fs.readFileSync(path.join(CARPETA, archivo), 'utf8');

describe('Migración 20261024130000_comentarios_reparacion_internos', () => {
  const admin = new PostgresAdminService(MASTER_TEST_URL);
  let pool: InstanceType<typeof Pool>;

  /** Ids de los fixtures que los `it` comparten. */
  const f = {
    comentarioReparacionA: '',
    comentarioReparacionB: '',
    publicoDelTicket: '',
    internoDelTicket: '',
  };

  async function uno<T>(sql: string, params: unknown[] = []): Promise<T> {
    const r = await pool.query(sql, params);
    return r.rows[0] as T;
  }

  /** Visibilidad de cada COMENTARIO del timeline, por id. */
  const visibilidad = async (): Promise<Record<string, boolean>> =>
    Object.fromEntries(
      (
        await pool.query<{ id: string; es_interno: boolean }>(
          `SELECT o.id, o.es_interno
             FROM operaciones_ticket o JOIN tipo_operacion t ON t.id = o.tipo_operacion_id
            WHERE t.codigo = 'COMENTARIO'`,
        )
      ).rows.map((r) => [r.id, r.es_interno]),
    );

  const updatedAtDe = async (id: string): Promise<Date> =>
    (
      await uno<{ updated_at: Date }>(`SELECT updated_at FROM operaciones_ticket WHERE id = $1`, [
        id,
      ])
    ).updated_at;

  beforeAll(async () => {
    await admin.createDatabase(DB);
    pool = new Pool({ connectionString: new PrismaService(MASTER_TEST_URL).buildTenantUrl(DB) });

    const carpetas = fs
      .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name <= ULTIMA_CARPETA_ANTES_DE_LA_COPIA)
      .map((e) => e.name)
      .sort();
    for (const carpeta of carpetas) {
      await pool.query(
        fs.readFileSync(path.join(MIGRATIONS_DIR, carpeta, 'migration.sql'), 'utf8'),
      );
    }

    // El catálogo del tenant lo siembra el provisioning; la base de test solo está migrada.
    await pool.query(
      `INSERT INTO tipo_operacion (codigo, nombre, updated_at) VALUES ('COMENTARIO', 'Comentario', now())`,
    );
    const tipo = await uno<{ id: string }>(
      `INSERT INTO tipos_ticket (codigo, nombre, modulo, updated_at)
       VALUES ('T-COMINT', 'Edilicia', 'EDILICIA', now()) RETURNING id`,
    );
    const estado = await uno<{ id: string }>(
      `INSERT INTO estados (codigo, nombre, updated_at) VALUES ('E-COMINT', 'Abierto', now()) RETURNING id`,
    );
    const prioridad = await uno<{ id: string }>(
      `INSERT INTO prioridades (codigo, nombre, updated_at) VALUES ('P-COMINT', 'Media', now()) RETURNING id`,
    );
    const ticket = (
      await uno<{ id: string }>(
        `INSERT INTO tickets (numero, titulo, tipo_id, estado_id, prioridad_id, solicitante_id, updated_at)
         VALUES ('COMINT-1', 'Ticket', $1, $2, $3, $4, now()) RETURNING id`,
        [tipo.id, estado.id, prioridad.id, SOLICITANTE],
      )
    ).id;
    const satelite = (
      await uno<{ id: string }>(
        `INSERT INTO ticket_edilicia (ticket_id, updated_at) VALUES ($1, now()) RETURNING id`,
        [ticket],
      )
    ).id;

    const comentarioDeReparacion = async (texto: string, fecha: string): Promise<string> =>
      (
        await uno<{ id: string }>(
          `INSERT INTO comentarios_reparacion (ticket_edilicia_id, texto, autor_id, created_at)
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [satelite, texto, AUTOR, fecha],
        )
      ).id;
    f.comentarioReparacionA = await comentarioDeReparacion(
      'Falta el repuesto X',
      '2026-09-03T08:00:00Z',
    );
    f.comentarioReparacionB = await comentarioDeReparacion(
      'Llegó el repuesto',
      '2026-09-04T09:30:00Z',
    );

    // Comentarios hechos desde Tickets: la migración no los toca, sea cual sea su visibilidad.
    const comentarioDelTicket = async (texto: string, esInterno: boolean): Promise<string> =>
      (
        await uno<{ id: string }>(
          `INSERT INTO operaciones_ticket (ticket_id, tipo_operacion_id, descripcion, autor_id, es_interno, created_at, updated_at)
           SELECT $1, id, $2, $3, $4, '2026-09-05T00:00:00Z', '2026-09-05T00:00:00Z'
             FROM tipo_operacion WHERE codigo = 'COMENTARIO' RETURNING id`,
          [ticket, texto, AUTOR, esInterno],
        )
      ).id;
    f.publicoDelTicket = await comentarioDelTicket('Público desde Tickets', false);
    f.internoDelTicket = await comentarioDelTicket('Interno desde Tickets', true);

    // La migración anterior, tal como quedó aplicada: copia los comentarios como públicos.
    await pool.query(fs.readFileSync(path.join(CARPETA_COPIA, 'migration.sql'), 'utf8'));
  }, 120_000);

  afterAll(async () => {
    await pool.end().catch(() => undefined);
    await admin.dropDatabase(DB);
  }, 60_000);

  it('parte de las copias públicas que dejó 20261024120000_ticket_unificado', async () => {
    expect(await visibilidad()).toEqual({
      [f.comentarioReparacionA]: false,
      [f.comentarioReparacionB]: false,
      [f.publicoDelTicket]: false,
      [f.internoDelTicket]: true,
    });
  });

  it('marca como internas solo las copias de los comentarios de reparación, sin tocar updated_at', async () => {
    const updatedAtAntes = await updatedAtDe(f.comentarioReparacionA);

    await pool.query(leer('migration.sql'));

    expect(await visibilidad()).toEqual({
      [f.comentarioReparacionA]: true,
      [f.comentarioReparacionB]: true,
      [f.publicoDelTicket]: false,
      [f.internoDelTicket]: true,
    });
    expect(await updatedAtDe(f.comentarioReparacionA)).toEqual(updatedAtAntes);
    // La tabla congelada no se toca: T4 la retira.
    expect(
      (await uno<{ total: string }>(`SELECT count(*) AS total FROM comentarios_reparacion`)).total,
    ).toBe('2');
  });

  it('es re-ejecutable: una segunda corrida deja la misma visibilidad', async () => {
    const antes = await visibilidad();

    await pool.query(leer('migration.sql'));

    expect(await visibilidad()).toEqual(antes);
  });

  it('el rollback devuelve las copias a públicas y no toca los comentarios del ticket', async () => {
    await pool.query(leer('rollback.sql'));

    expect(await visibilidad()).toEqual({
      [f.comentarioReparacionA]: false,
      [f.comentarioReparacionB]: false,
      [f.publicoDelTicket]: false,
      [f.internoDelTicket]: true,
    });
  });

  it('el rollback es re-ejecutable y la migración se puede volver a aplicar después', async () => {
    await pool.query(leer('rollback.sql'));
    expect((await visibilidad())[f.comentarioReparacionA]).toBe(false);

    await pool.query(leer('migration.sql'));

    expect(await visibilidad()).toEqual({
      [f.comentarioReparacionA]: true,
      [f.comentarioReparacionB]: true,
      [f.publicoDelTicket]: false,
      [f.internoDelTicket]: true,
    });
  });
});
