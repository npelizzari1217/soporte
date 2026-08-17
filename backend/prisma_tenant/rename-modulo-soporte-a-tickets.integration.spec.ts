/**
 * rename-modulo-soporte-a-tickets.integration.spec.ts — WU-7.2
 * (sdd/matriz-permisos-por-usuario, paso 3b del deploy atómico ADR-P8).
 *
 * Ejecuta el SQL de la migración `20260817120000_rename_modulo_soporte_a_tickets`
 * (tenant) directo contra Postgres, sin pasar por `prisma migrate deploy` —
 * mismo patrón que `compras-checks.integration.spec.ts`: cliente `pg` crudo
 * contra `soporte_tenant_test`, acotando el blast radius a las filas propias
 * de este spec (DB compartida con el resto de la suite de integración).
 *
 * Ref spec: sdd/matriz-permisos-por-usuario/spec R8, S18. El punto crítico de
 * S18 (`codigo` NUNCA se toca, el prefijo `SOP` sobrevive) se verifica leyendo
 * la columna `codigo` intacta — el prefijo de numeración es responsabilidad de
 * `numerador-ticket.service.ts` en runtime, fuera del alcance de esta migración.
 */
import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

const TENANT_TEST_URL =
  process.env.DATABASE_URL_TENANT ??
  'postgresql://soporte:soporte@localhost:5432/soporte_tenant_test';

const MIGRATION_FILE = path.resolve(
  __dirname,
  './migrations/20260817120000_rename_modulo_soporte_a_tickets/migration.sql',
);

describe('Rename modulo SOPORTE→TICKETS en tipos_ticket (WU-7.2, tenant)', () => {
  let client: Client;
  let tipoSoporteId: string;
  let tipoComprasId: string;

  async function limpiarDatosDeEsteSpec(): Promise<void> {
    await client.query(
      `DELETE FROM tipos_ticket WHERE codigo IN ('RENAME_TEST_SOPORTE', 'RENAME_TEST_COMPRAS')`,
    );
  }

  beforeAll(async () => {
    client = new Client({ connectionString: TENANT_TEST_URL });
    await client.connect();
    await limpiarDatosDeEsteSpec();

    const soporte = await client.query(
      `INSERT INTO tipos_ticket (id, codigo, nombre, modulo, activo, updated_at)
       VALUES (gen_random_uuid(), 'RENAME_TEST_SOPORTE', 'Rename test soporte', 'SOPORTE', true, now())
       RETURNING id`,
    );
    tipoSoporteId = soporte.rows[0].id as string;

    const compras = await client.query(
      `INSERT INTO tipos_ticket (id, codigo, nombre, modulo, activo, updated_at)
       VALUES (gen_random_uuid(), 'RENAME_TEST_COMPRAS', 'Rename test compras', 'COMPRAS', true, now())
       RETURNING id`,
    );
    tipoComprasId = compras.rows[0].id as string;
  });

  afterAll(async () => {
    await limpiarDatosDeEsteSpec();
    await client.end();
  });

  it('[S18] UPDATE renombra modulo pero NUNCA toca codigo', async () => {
    const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
    await client.query(sql);

    const soporte = await client.query('SELECT codigo, modulo FROM tipos_ticket WHERE id = $1', [
      tipoSoporteId,
    ]);
    expect(soporte.rows[0].modulo).toBe('TICKETS');
    expect(soporte.rows[0].codigo).toBe('RENAME_TEST_SOPORTE');

    const compras = await client.query('SELECT codigo, modulo FROM tipos_ticket WHERE id = $1', [
      tipoComprasId,
    ]);
    expect(compras.rows[0].modulo).toBe('COMPRAS');

    // No hay más filas de ESTE fixture con modulo='SOPORTE' tras el UPDATE
    // (acotado por codigo, no un COUNT global — la DB de test es compartida
    // y puede tener otras filas de otros specs con modulo='SOPORTE' vivas en
    // paralelo).
    const restanteDelFixture = await client.query(
      `SELECT count(*)::int AS n FROM tipos_ticket
       WHERE modulo = 'SOPORTE' AND codigo IN ('RENAME_TEST_SOPORTE', 'RENAME_TEST_COMPRAS')`,
    );
    expect(restanteDelFixture.rows[0].n).toBe(0);
  });
});
