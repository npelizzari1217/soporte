/**
 * tickets-reloj-sla.integration.spec.ts — WU-3a (sdd/sla-primera-respuesta-y-pausa).
 *
 * Contra Postgres REAL, en un tenant efimero propio: ejerce la migracion M2
 * `20261007130000_tickets_reloj_sla` (columnas del reloj, defaults en dos pasos, CHECK,
 * indices parciales, rollback) y la paridad entre los defaults de Prisma y los del DDL.
 * Cliente `pg` crudo: el sujeto es el DDL, no el mapper.
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
const TENANT_DB_NAME = `soporte_prov_relojsla_${randomBytes(4).toString('hex')}_test`;
const MIGRACION = join(
  __dirname,
  '../../../../../prisma_tenant/migrations/20261007130000_tickets_reloj_sla',
);
const sql = (archivo: string): string => readFileSync(join(MIGRACION, archivo), 'utf8');

function buildTenantUrl(dbName: string): string {
  const url = new URL(MASTER_TEST_URL);
  url.pathname = `/${dbName}`;
  return url.toString();
}

describe('tickets — migracion M2 del reloj de SLA (WU-3a, tenant efimero)', () => {
  const admin = new PostgresAdminService(MASTER_TEST_URL);
  const migrationRunner = new TenantMigrationRunnerAdapter(MASTER_TEST_URL);
  let client: Client;
  let tipoId: string;
  let estadoId: string;
  let prioridadId: string;
  let contador = 0;

  beforeAll(async () => {
    await admin.createDatabase(TENANT_DB_NAME);
    await migrationRunner.run(TENANT_DB_NAME);
    client = new Client({ connectionString: buildTenantUrl(TENANT_DB_NAME) });
    await client.connect();
    prioridadId = (
      await client.query(
        `INSERT INTO prioridades (id, codigo, nombre, updated_at)
         VALUES (gen_random_uuid(), 'T_M2', 'Prioridad M2', now()) RETURNING id`,
      )
    ).rows[0].id as string;
    estadoId = (
      await client.query(
        `INSERT INTO estados (id, codigo, nombre, updated_at)
         VALUES (gen_random_uuid(), 'T_M2_NUEVO', 'Nuevo M2', now()) RETURNING id`,
      )
    ).rows[0].id as string;
    tipoId = (
      await client.query(
        `INSERT INTO tipos_ticket (id, codigo, nombre, modulo, updated_at)
         VALUES (gen_random_uuid(), 'T_M2_SOP', 'Soporte M2', 'SOPORTE', now()) RETURNING id`,
      )
    ).rows[0].id as string;
  }, 60_000);

  afterAll(async () => {
    await client.end();
    await admin.dropDatabase(TENANT_DB_NAME);
  }, 60_000);

  async function insertarTicket(extra = ''): Promise<Record<string, unknown>> {
    contador += 1;
    const cols = extra ? `, ${extra.split('=')[0]}` : '';
    const vals = extra ? `, ${extra.split('=')[1]}` : '';
    const r = await client.query(
      `INSERT INTO tickets (id, numero, titulo, tipo_id, estado_id, prioridad_id, solicitante_id, updated_at${cols})
       VALUES (gen_random_uuid(), $1, 'Ticket M2', $2, $3, $4, gen_random_uuid(), now()${vals})
       RETURNING *`,
      [`M2TEST-${contador}`, tipoId, estadoId, prioridadId],
    );
    return r.rows[0] as Record<string, unknown>;
  }

  it('las filas existentes quedan con acumulado y corre_desde NULL; las nuevas nacen con defaults', async () => {
    // Se deshace M2 para sembrar un ticket "previo" y se reaplica el DDL real.
    await client.query(sql('rollback.sql'));
    contador += 1;
    await client.query(
      `INSERT INTO tickets (id, numero, titulo, tipo_id, estado_id, prioridad_id, solicitante_id, updated_at)
       VALUES (gen_random_uuid(), $1, 'Previo', $2, $3, $4, gen_random_uuid(), now())`,
      [`M2PREV-${contador}`, tipoId, estadoId, prioridadId],
    );
    await client.query(sql('migration.sql'));

    const previo = (await client.query(`SELECT * FROM tickets WHERE titulo = 'Previo'`)).rows[0];
    expect(previo.sla_acumulado_s).toBeNull();
    expect(previo.sla_corre_desde).toBeNull();
    expect(previo.sla_meta_s).toBeNull();
    expect(previo.sla_cumplido).toBeNull();
    expect(previo).toMatchObject({
      sla_reloj_seq_hasta: 0,
      sla_reloj_version: 0,
      sla_reloj_pendiente: false,
    });

    const nuevo = await insertarTicket();
    expect(nuevo.sla_acumulado_s).toBe(0);
    expect(nuevo.sla_corre_desde).toBeInstanceOf(Date);
    expect(nuevo.sla_meta_s).toBeNull();
  });

  it('M2 no recalcula vencimientos ni cumplimientos de los tickets previos', async () => {
    const previo = (
      await client.query(
        `SELECT sla_vence_at, vencido, sla_cumplido FROM tickets WHERE titulo = 'Previo'`,
      )
    ).rows[0];
    expect(previo).toEqual({ sla_vence_at: null, vencido: false, sla_cumplido: null });
  });

  it.each([
    ['sla_acumulado_s=-1', /tickets_sla_acumulado_s_check/],
    ['sla_meta_s=0', /tickets_sla_meta_s_check/],
    ['sla_meta_s=-5', /tickets_sla_meta_s_check/],
  ])('el CHECK rechaza %s', async (extra, error) => {
    await expect(insertarTicket(extra)).rejects.toThrow(error);
  });

  it('acepta NULL y valores validos en acumulado y meta', async () => {
    await expect(insertarTicket('sla_acumulado_s=NULL')).resolves.toBeDefined();
    const ok = await insertarTicket('sla_meta_s=3600');
    expect(ok.sla_meta_s).toBe(3600);
  });

  it('crea los dos indices parciales con su predicado', async () => {
    const r = await client.query(
      `SELECT indexname, indexdef FROM pg_indexes
        WHERE indexname IN ('tickets_sla_reloj_pendiente_idx', 'operaciones_ticket_ticket_id_sla_reloj_seq_idx')`,
    );
    const defs = Object.fromEntries(r.rows.map((x) => [x.indexname, x.indexdef as string]));
    expect(defs['tickets_sla_reloj_pendiente_idx']).toMatch(/WHERE sla_reloj_pendiente/);
    expect(defs['operaciones_ticket_ticket_id_sla_reloj_seq_idx']).toMatch(
      /sla_reloj_seq IS NOT NULL/,
    );
  });

  it('deriva: los defaults de Prisma y del DDL coinciden en las 6 columnas con default', async () => {
    // El runtime DMMF no trae los defaults: se leen del schema.prisma, la fuente real.
    const schema = readFileSync(join(MIGRACION, '../../schema.prisma'), 'utf8');
    const modeloTicket = schema.slice(
      schema.indexOf('model Ticket {'),
      schema.indexOf('@@map("tickets")'),
    );
    const prisma: Record<string, string> = {};
    for (const m of modeloTicket.matchAll(
      /@default\((\w+(?:\(\))?)\)(?=[^\n]*@map\("(sla_\w+)"\))/g,
    )) {
      prisma[m[2]] = m[1];
    }
    const r = await client.query(
      `SELECT column_name, column_default FROM information_schema.columns
        WHERE table_name = 'tickets' AND column_name LIKE 'sla\\_%' AND column_default IS NOT NULL`,
    );
    const ddl = Object.fromEntries(
      r.rows
        .filter((x) => x.column_name !== 'sla_regla') // cubierta por tickets-sla-regla.integration.spec.ts
        .map((x) => [x.column_name, String(x.column_default).replace(/^'?(.*?)'?(::.*)?$/, '$1')]),
    );
    delete prisma['sla_regla'];
    expect(Object.keys(ddl)).toHaveLength(6);
    expect(ddl).toEqual(prisma);
  });
});
