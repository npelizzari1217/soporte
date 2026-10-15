/**
 * tickets-tiempos-habiles.integration.spec.ts — T1 de odd/promedios-dashboard-habiles.
 *
 * Contra Postgres REAL, en un tenant efimero propio: ejerce la migracion
 * `20261015140000_tiempos_habiles_tickets` (columnas, CHECK, backfill SQL desde el reloj, rollback
 * re-ejecutable) y la paridad con el schema de Prisma. Cliente `pg` crudo: el sujeto es el SQL.
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
const TENANT_DB_NAME = `soporte_prov_tiemphab_${randomBytes(4).toString('hex')}_test`;
const MIGRACION = join(
  __dirname,
  '../../../../../prisma_tenant/migrations/20261015140000_tiempos_habiles_tickets',
);
const sql = (archivo: string): string => readFileSync(join(MIGRACION, archivo), 'utf8');
const COLUMNAS = ['primera_respuesta_habil_s', 'resolucion_habil_s'];

function buildTenantUrl(dbName: string): string {
  const url = new URL(MASTER_TEST_URL);
  url.pathname = `/${dbName}`;
  return url.toString();
}

describe('tickets — migracion de tiempos habiles guardados (tenant efimero)', () => {
  const admin = new PostgresAdminService(MASTER_TEST_URL);
  const migrationRunner = new TenantMigrationRunnerAdapter(MASTER_TEST_URL);
  let client: Client;
  let tipoId: string;
  let prioridadId: string;
  const estados: Record<string, string> = {};
  let contador = 0;

  beforeAll(async () => {
    await admin.createDatabase(TENANT_DB_NAME);
    await migrationRunner.run(TENANT_DB_NAME);
    client = new Client({ connectionString: buildTenantUrl(TENANT_DB_NAME) });
    await client.connect();
    prioridadId = (
      await client.query(
        `INSERT INTO prioridades (id, codigo, nombre, updated_at)
         VALUES (gen_random_uuid(), 'T_TH', 'Prioridad TH', now()) RETURNING id`,
      )
    ).rows[0].id as string;
    tipoId = (
      await client.query(
        `INSERT INTO tipos_ticket (id, codigo, nombre, modulo, updated_at)
         VALUES (gen_random_uuid(), 'T_TH_SOP', 'Soporte TH', 'SOPORTE', now()) RETURNING id`,
      )
    ).rows[0].id as string;
    for (const codigo of ['EN_PROCESO', 'RESUELTO', 'CERRADO']) {
      await client.query(
        `INSERT INTO estados (id, codigo, nombre, updated_at)
         VALUES (gen_random_uuid(), $1, $1, now()) ON CONFLICT (codigo) DO NOTHING`,
        [codigo],
      );
      estados[codigo] = (await client.query(`SELECT id FROM estados WHERE codigo = $1`, [codigo]))
        .rows[0].id as string;
    }
  }, 60_000);

  afterAll(async () => {
    await client.end();
    await admin.dropDatabase(TENANT_DB_NAME);
  }, 60_000);

  async function ticket(p: {
    estado: string;
    regla?: string;
    acumuladoS: number | null;
    pendiente?: boolean;
  }): Promise<string> {
    contador += 1;
    return (
      await client.query(
        `INSERT INTO tickets (id, numero, titulo, tipo_id, estado_id, prioridad_id, solicitante_id,
                              sla_regla, sla_acumulado_s, sla_reloj_pendiente, updated_at)
         VALUES (gen_random_uuid(), $1, 'Ticket TH', $2, $3, $4, gen_random_uuid(), $5, $6, $7, now())
         RETURNING id`,
        [
          `THTEST-${contador}`,
          tipoId,
          estados[p.estado],
          prioridadId,
          p.regla ?? 'HABIL',
          p.acumuladoS,
          p.pendiente ?? false,
        ],
      )
    ).rows[0].id as string;
  }

  const fila = async (id: string): Promise<Record<string, unknown>> =>
    (
      await client.query(
        `SELECT resolucion_habil_s, primera_respuesta_habil_s FROM tickets WHERE id = $1`,
        [id],
      )
    ).rows[0] as Record<string, unknown>;

  it('el backfill solo completa HABIL en RESUELTO o CERRADO con reloj incorporado y sin pliegue pendiente', async () => {
    // Se deshace la migracion para sembrar tickets "previos" y se reaplica el DDL real.
    await client.query(sql('rollback.sql'));
    const resuelto = await ticket({ estado: 'RESUELTO', acumuladoS: 3600 });
    const cerrado = await ticket({ estado: 'CERRADO', acumuladoS: 7200 });
    const abierto = await ticket({ estado: 'EN_PROCESO', acumuladoS: 100 });
    const corrido = await ticket({ estado: 'RESUELTO', regla: 'CORRIDO', acumuladoS: 500 });
    const sinReloj = await ticket({ estado: 'CERRADO', acumuladoS: null });
    const pendiente = await ticket({ estado: 'RESUELTO', acumuladoS: 900, pendiente: true });
    await client.query(sql('migration.sql'));

    expect(await fila(resuelto)).toEqual({
      resolucion_habil_s: 3600,
      primera_respuesta_habil_s: null,
    });
    expect((await fila(cerrado)).resolucion_habil_s).toBe(7200);
    for (const id of [abierto, corrido, sinReloj, pendiente]) {
      expect((await fila(id)).resolucion_habil_s).toBeNull();
    }
  });

  it.each([
    ['resolucion_habil_s', /tickets_resolucion_habil_s_check/],
    ['primera_respuesta_habil_s', /tickets_primera_respuesta_habil_s_check/],
  ])('el CHECK rechaza %s negativo y acepta 0', async (columna, error) => {
    const id = await ticket({ estado: 'RESUELTO', acumuladoS: 10 });
    await expect(
      client.query(`UPDATE tickets SET ${columna} = -1 WHERE id = $1`, [id]),
    ).rejects.toThrow(error);
    await client.query(`UPDATE tickets SET ${columna} = 0 WHERE id = $1`, [id]);
    expect((await fila(id))[columna]).toBe(0);
  });

  it('las columnas nacen NULL y sin default', async () => {
    const r = await client.query(
      `SELECT column_name, column_default, is_nullable FROM information_schema.columns
        WHERE table_name = 'tickets' AND column_name = ANY($1) ORDER BY column_name`,
      [COLUMNAS],
    );
    expect(r.rows).toEqual(
      COLUMNAS.map((c) => ({ column_name: c, column_default: null, is_nullable: 'YES' })),
    );
  });

  it('rollback.sql retira las columnas, se puede correr dos veces, y la migracion se reaplica', async () => {
    await client.query(sql('rollback.sql'));
    await client.query(sql('rollback.sql'));
    const cols = await client.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'tickets' AND column_name = ANY($1)`,
      [COLUMNAS],
    );
    expect(cols.rows).toHaveLength(0);
    await client.query(sql('migration.sql'));
    const checks = await client.query(
      `SELECT conname FROM pg_constraint
        WHERE conname IN ('tickets_resolucion_habil_s_check', 'tickets_primera_respuesta_habil_s_check')`,
    );
    expect(checks.rows).toHaveLength(2);
  });

  it('deriva: el schema de Prisma mapea las dos columnas, opcionales y sin @default', () => {
    const schema = readFileSync(join(MIGRACION, '../../schema.prisma'), 'utf8');
    const modeloTicket = schema.slice(
      schema.indexOf('model Ticket {'),
      schema.indexOf('@@map("tickets")'),
    );
    for (const columna of COLUMNAS) {
      const linea = modeloTicket.split('\n').find((l) => l.includes(`@map("${columna}")`));
      expect(linea).toMatch(/\bInt\?/);
      expect(linea).not.toMatch(/@default/);
    }
  });
});
