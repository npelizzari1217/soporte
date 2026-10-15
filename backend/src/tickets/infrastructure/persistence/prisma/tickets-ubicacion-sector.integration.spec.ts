/**
 * tickets-ubicacion-sector.integration.spec.ts — T1 de odd/ubicacion-sector-ticket.
 *
 * Contra Postgres REAL, en un tenant efimero propio: ejerce la migracion
 * `20261015200000_ubicacion_sector_tickets` (columnas, FK RESTRICT, indice parcial, rollback
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
const TENANT_DB_NAME = `soporte_prov_ubisec_${randomBytes(4).toString('hex')}_test`;
const MIGRACION = join(
  __dirname,
  '../../../../../prisma_tenant/migrations/20261015200000_ubicacion_sector_tickets',
);
const sql = (archivo: string): string => readFileSync(join(MIGRACION, archivo), 'utf8');
const COLUMNAS = ['sector_id', 'ubicacion'];

function buildTenantUrl(dbName: string): string {
  const url = new URL(MASTER_TEST_URL);
  url.pathname = `/${dbName}`;
  return url.toString();
}

describe('tickets — migracion de ubicacion y sector (tenant efimero)', () => {
  const admin = new PostgresAdminService(MASTER_TEST_URL);
  const migrationRunner = new TenantMigrationRunnerAdapter(MASTER_TEST_URL);
  let client: Client;
  let tipoId: string;
  let prioridadId: string;
  let estadoId: string;
  let sectorId: string;
  let contador = 0;

  beforeAll(async () => {
    await admin.createDatabase(TENANT_DB_NAME);
    await migrationRunner.run(TENANT_DB_NAME);
    client = new Client({ connectionString: buildTenantUrl(TENANT_DB_NAME) });
    await client.connect();
    prioridadId = (
      await client.query(
        `INSERT INTO prioridades (id, codigo, nombre, updated_at)
         VALUES (gen_random_uuid(), 'T_US', 'Prioridad US', now()) RETURNING id`,
      )
    ).rows[0].id as string;
    tipoId = (
      await client.query(
        `INSERT INTO tipos_ticket (id, codigo, nombre, modulo, updated_at)
         VALUES (gen_random_uuid(), 'T_US_SOP', 'Soporte US', 'SOPORTE', now()) RETURNING id`,
      )
    ).rows[0].id as string;
    await client.query(
      `INSERT INTO estados (id, codigo, nombre, updated_at)
       VALUES (gen_random_uuid(), 'NUEVO', 'Nuevo', now()) ON CONFLICT (codigo) DO NOTHING`,
    );
    estadoId = (await client.query(`SELECT id FROM estados WHERE codigo = 'NUEVO'`)).rows[0]
      .id as string;
    sectorId = (
      await client.query(
        `INSERT INTO sectores (id, codigo, nombre, updated_at)
         VALUES (gen_random_uuid(), 'US_COMP', 'Computacion', now()) RETURNING id`,
      )
    ).rows[0].id as string;
  }, 60_000);

  afterAll(async () => {
    await client.end();
    await admin.dropDatabase(TENANT_DB_NAME);
  }, 60_000);

  async function ticket(p: { ubicacion?: string | null; sectorId?: string | null }) {
    contador += 1;
    return client.query(
      `INSERT INTO tickets (id, numero, titulo, tipo_id, estado_id, prioridad_id, solicitante_id,
                            ubicacion, sector_id, updated_at)
       VALUES (gen_random_uuid(), $1, 'Ticket US', $2, $3, $4, gen_random_uuid(), $5, $6, now())
       RETURNING id`,
      [
        `USTEST-${contador}`,
        tipoId,
        estadoId,
        prioridadId,
        p.ubicacion ?? null,
        p.sectorId ?? null,
      ],
    );
  }

  it('las columnas nacen nullables y sin default; un ticket sin ellas se inserta igual', async () => {
    const r = await client.query(
      `SELECT column_name, column_default, is_nullable FROM information_schema.columns
        WHERE table_name = 'tickets' AND column_name = ANY($1) ORDER BY column_name`,
      [COLUMNAS],
    );
    expect(r.rows).toEqual(
      COLUMNAS.map((c) => ({ column_name: c, column_default: null, is_nullable: 'YES' })),
    );
    await expect(ticket({})).resolves.toBeDefined();
  });

  it('ubicacion admite 255 caracteres y rechaza 256 (backstop del VARCHAR)', async () => {
    await expect(ticket({ ubicacion: 'U'.repeat(255) })).resolves.toBeDefined();
    await expect(ticket({ ubicacion: 'U'.repeat(256) })).rejects.toThrow(/too long/);
  });

  it('el FK rechaza un sector inexistente y RESTRICT impide borrar un sector usado', async () => {
    await expect(ticket({ sectorId: '00000000-0000-0000-0000-000000000000' })).rejects.toThrow(
      /tickets_sector_id_fkey/,
    );
    await ticket({ sectorId });
    await expect(client.query(`DELETE FROM sectores WHERE id = $1`, [sectorId])).rejects.toThrow(
      /tickets_sector_id_fkey/,
    );
  });

  it('el indice de sector_id es parcial (WHERE sector_id IS NOT NULL)', async () => {
    const r = await client.query(
      `SELECT indexdef FROM pg_indexes WHERE indexname = 'tickets_sector_id_idx'`,
    );
    expect(r.rows[0].indexdef).toMatch(/WHERE \(sector_id IS NOT NULL\)/);
  });

  it('rollback.sql retira columnas, FK e indice, se puede correr dos veces, y la migracion se reaplica', async () => {
    await client.query(sql('rollback.sql'));
    await client.query(sql('rollback.sql'));
    const cols = await client.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'tickets' AND column_name = ANY($1)`,
      [COLUMNAS],
    );
    expect(cols.rows).toHaveLength(0);
    const fk = await client.query(
      `SELECT 1 FROM pg_constraint WHERE conname = 'tickets_sector_id_fkey'`,
    );
    expect(fk.rows).toHaveLength(0);
    // Sin el FK, el sector que estaba en uso ya se puede borrar.
    await client.query(`DELETE FROM sectores WHERE id = $1`, [sectorId]);

    await client.query(sql('migration.sql'));
    const reaplicadas = await client.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'tickets' AND column_name = ANY($1)`,
      [COLUMNAS],
    );
    expect(reaplicadas.rows).toHaveLength(2);
    const idx = await client.query(
      `SELECT 1 FROM pg_indexes WHERE indexname = 'tickets_sector_id_idx'`,
    );
    expect(idx.rows).toHaveLength(1);
  });

  it('deriva: el schema de Prisma mapea las dos columnas, opcionales y sin @default', () => {
    const schema = readFileSync(join(MIGRACION, '../../schema.prisma'), 'utf8');
    const modeloTicket = schema.slice(
      schema.indexOf('model Ticket {'),
      schema.indexOf('@@map("tickets")'),
    );
    const lineas = modeloTicket.split('\n');
    const ubicacion = lineas.find((l) => /^\s*ubicacion\s/.test(l));
    expect(ubicacion).toMatch(/String\?\s+@db\.VarChar\(255\)/);
    const sector = lineas.find((l) => l.includes('@map("sector_id")'));
    expect(sector).toMatch(/String\?/);
    for (const linea of [ubicacion, sector]) {
      expect(linea).not.toMatch(/@default/);
    }
  });
});
