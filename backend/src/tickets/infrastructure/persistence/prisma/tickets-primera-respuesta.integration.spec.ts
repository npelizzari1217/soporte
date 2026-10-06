/**
 * tickets-primera-respuesta.integration.spec.ts — WU-6 (sdd/sla-primera-respuesta-y-pausa).
 *
 * Contra Postgres REAL, en un tenant efimero propio: ejerce la migracion M4
 * `20261007150000_tickets_primera_respuesta` (columnas, indice parcial, RELLENO desde el historial,
 * rollback) y la paridad entre el default de Prisma y el del DDL. Cliente `pg` crudo: el sujeto es el SQL.
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
  '../../../../../prisma_tenant/migrations/20261007150000_tickets_primera_respuesta',
);
const sql = (archivo: string): string => readFileSync(join(MIGRACION, archivo), 'utf8');
/** Solo la sentencia de relleno: reaplicarla debe ser inocua (idempotencia). */
const relleno = (): string => sql('migration.sql').slice(sql('migration.sql').indexOf('UPDATE'));

function buildTenantUrl(dbName: string): string {
  const url = new URL(MASTER_TEST_URL);
  url.pathname = `/${dbName}`;
  return url.toString();
}

describe('tickets — migracion M4 de la primera respuesta (WU-6, tenant efimero)', () => {
  const admin = new PostgresAdminService(MASTER_TEST_URL);
  const migrationRunner = new TenantMigrationRunnerAdapter(MASTER_TEST_URL);
  let client: Client;
  let tipoId: string;
  let estadoId: string;
  let prioridadId: string;
  let tipoOpComentarioId: string;
  let externoId: string;
  let contador = 0;
  const TECNICO = '01900000-0000-7000-8000-0000000000b1';
  const SOLICITANTE = '01900000-0000-7000-8000-0000000000b2';
  const t = (hora: number) => `2026-09-01T${String(hora).padStart(2, '0')}:00:00.000Z`;

  async function ticketPrevio(titulo: string, solicitante: string | null): Promise<string> {
    contador += 1;
    return (
      await client.query(
        `INSERT INTO tickets (id, numero, titulo, tipo_id, estado_id, prioridad_id, solicitante_id, solicitante_externo_id, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, now()) RETURNING id`,
        [
          `M4TEST-${contador}`,
          titulo,
          tipoId,
          estadoId,
          prioridadId,
          solicitante,
          solicitante ? null : externoId,
        ],
      )
    ).rows[0].id as string;
  }

  async function comentario(
    ticketId: string,
    autor: string,
    cuando: string,
    { interno = false, borrado = false } = {},
  ): Promise<void> {
    await client.query(
      `INSERT INTO operaciones_ticket (id, ticket_id, tipo_operacion_id, descripcion, autor_id, es_interno, created_at, updated_at, deleted_at)
       VALUES (gen_random_uuid(), $1, $2, 'x', $3, $4, $5, now(), $6)`,
      [ticketId, tipoOpComentarioId, autor, interno, cuando, borrado ? cuando : null],
    );
  }

  const primeraRespuesta = async (id: string): Promise<Date | null> =>
    (await client.query(`SELECT primera_respuesta_at FROM tickets WHERE id = $1`, [id])).rows[0]
      .primera_respuesta_at as Date | null;

  beforeAll(async () => {
    await admin.createDatabase(TENANT_DB_NAME);
    await migrationRunner.run(TENANT_DB_NAME);
    client = new Client({ connectionString: buildTenantUrl(TENANT_DB_NAME) });
    await client.connect();
    prioridadId = (
      await client.query(
        `INSERT INTO prioridades (id, codigo, nombre, sla_primera_respuesta_horas, updated_at)
         VALUES (gen_random_uuid(), 'T_M4', 'Prioridad M4', 4, now()) RETURNING id`,
      )
    ).rows[0].id as string;
    estadoId = (
      await client.query(
        `INSERT INTO estados (id, codigo, nombre, updated_at)
         VALUES (gen_random_uuid(), 'T_M4_NUEVO', 'Nuevo M4', now()) RETURNING id`,
      )
    ).rows[0].id as string;
    tipoId = (
      await client.query(
        `INSERT INTO tipos_ticket (id, codigo, nombre, modulo, updated_at)
         VALUES (gen_random_uuid(), 'T_M4_SOP', 'Soporte M4', 'SOPORTE', now()) RETURNING id`,
      )
    ).rows[0].id as string;
    tipoOpComentarioId = (
      await client.query(
        `INSERT INTO tipo_operacion (id, codigo, nombre, updated_at)
         VALUES (gen_random_uuid(), 'COMENTARIO', 'Comentario', now())
         ON CONFLICT (codigo) DO UPDATE SET nombre = EXCLUDED.nombre RETURNING id`,
      )
    ).rows[0].id as string;
    externoId = (
      await client.query(
        `INSERT INTO solicitantes_externos (id, nombre, email, email_verificado_at, updated_at)
         VALUES (gen_random_uuid(), 'Externo', 'externo@example.com', now(), now()) RETURNING id`,
      )
    ).rows[0].id as string;
  }, 60_000);

  afterAll(async () => {
    await client.end();
    await admin.dropDatabase(TENANT_DB_NAME);
  }, 60_000);

  it('rellena desde el historial: ignora interno, borrado y solicitante; toma el primer publico de un tecnico', async () => {
    // Se deshace M4 para sembrar tickets "previos" y se aplica el DDL real.
    await client.query(sql('rollback.sql'));
    const tecnico = await ticketPrevio('Con tecnico', SOLICITANTE);
    await comentario(tecnico, TECNICO, t(8), { interno: true });
    await comentario(tecnico, TECNICO, t(9), { borrado: true });
    await comentario(tecnico, SOLICITANTE, t(10));
    await comentario(tecnico, TECNICO, t(11));
    await comentario(tecnico, TECNICO, t(12));
    const soloSolicitante = await ticketPrevio('Solo solicitante', SOLICITANTE);
    await comentario(soloSolicitante, SOLICITANTE, t(9));
    const externo = await ticketPrevio('Externo', null);
    await comentario(externo, TECNICO, t(13));
    const sinComentarios = await ticketPrevio('Sin comentarios', SOLICITANTE);

    await client.query(sql('migration.sql'));

    expect((await primeraRespuesta(tecnico))?.toISOString()).toBe(t(11));
    expect(await primeraRespuesta(soloSolicitante)).toBeNull();
    expect((await primeraRespuesta(externo))?.toISOString()).toBe(t(13));
    expect(await primeraRespuesta(sinComentarios)).toBeNull();
  });

  it('no asigna meta ni vencimiento retroactivos aunque la prioridad ya tenga meta', async () => {
    const r = await client.query(
      `SELECT t.primera_respuesta_vence_at, t.primera_respuesta_vencida, p.sla_primera_respuesta_horas
         FROM tickets t JOIN prioridades p ON p.id = t.prioridad_id`,
    );
    expect(r.rows).toHaveLength(4);
    for (const fila of r.rows) {
      expect(fila.sla_primera_respuesta_horas).toBe(4);
      expect(fila.primera_respuesta_vence_at).toBeNull();
      expect(fila.primera_respuesta_vencida).toBe(false);
    }
  });

  it('reaplicar el relleno no cambia ninguna fecha, ni siquiera ante comentarios posteriores', async () => {
    const antes = (await client.query(`SELECT id, primera_respuesta_at FROM tickets ORDER BY id`))
      .rows;
    const conFecha = antes.find((x) => x.primera_respuesta_at !== null);
    await comentario(conFecha.id, TECNICO, '2026-09-01T00:30:00.000Z'); // anterior a la fecha ya guardada

    await client.query(relleno());
    await client.query(relleno());

    const despues = (await client.query(`SELECT id, primera_respuesta_at FROM tickets ORDER BY id`))
      .rows;
    expect(despues).toEqual(antes);
  });

  it('un ticket nuevo nace sin respuesta, sin vencimiento y con vencida=false', async () => {
    const id = await ticketPrevio('Nuevo', SOLICITANTE);
    const fila = (await client.query(`SELECT * FROM tickets WHERE id = $1`, [id])).rows[0];
    expect(fila).toMatchObject({
      primera_respuesta_at: null,
      primera_respuesta_vence_at: null,
      primera_respuesta_vencida: false,
    });
  });

  it('crea el indice parcial con su predicado', async () => {
    const r = await client.query(
      `SELECT indexdef FROM pg_indexes WHERE indexname = 'tickets_primera_respuesta_pendiente_idx'`,
    );
    const def = r.rows[0].indexdef as string;
    expect(def).toMatch(/primera_respuesta_at IS NULL/);
    expect(def).toMatch(/NOT primera_respuesta_vencida/);
    expect(def).toMatch(/primera_respuesta_vence_at IS NOT NULL/);
  });

  it('rollback.sql retira las 3 columnas y el indice, y M4 se puede reaplicar', async () => {
    await client.query(sql('rollback.sql'));
    const cols = await client.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'tickets' AND column_name LIKE 'primera\\_respuesta%'`,
    );
    expect(cols.rows).toHaveLength(0);
    await client.query(sql('migration.sql'));
    expect(
      await primeraRespuesta((await client.query(`SELECT id FROM tickets LIMIT 1`)).rows[0].id),
    ).toBeDefined();
  });

  it('deriva: el default de Prisma y el del DDL coinciden en primera_respuesta_vencida', async () => {
    const schema = readFileSync(join(MIGRACION, '../../schema.prisma'), 'utf8');
    const modeloTicket = schema.slice(
      schema.indexOf('model Ticket {'),
      schema.indexOf('@@map("tickets")'),
    );
    const prisma: Record<string, string> = {};
    for (const m of modeloTicket.matchAll(
      /@default\((\w+(?:\(\))?)\)(?=[^\n]*@map\("(primera_respuesta_\w+)"\))/g,
    )) {
      prisma[m[2]] = m[1];
    }
    const r = await client.query(
      `SELECT column_name, column_default FROM information_schema.columns
        WHERE table_name = 'tickets' AND column_name LIKE 'primera\\_respuesta%' AND column_default IS NOT NULL`,
    );
    const ddl = Object.fromEntries(r.rows.map((x) => [x.column_name, String(x.column_default)]));
    expect(ddl).toEqual(prisma);
  });
});
