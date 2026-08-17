/**
 * rename-modulo-soporte-a-tickets.integration.spec.ts — WU-7.2
 * (sdd/matriz-permisos-por-usuario, paso 3a del deploy atómico ADR-P8).
 *
 * Ejecuta el SQL de la migración `20260817120000_rename_modulo_soporte_a_tickets`
 * (master) directo contra Postgres, sin pasar por `prisma migrate deploy` —
 * mismo patrón que `backfill-matriz-permisos.integration.spec.ts` (WU-4):
 * lee el archivo con `fs.readFileSync` y lo corre como texto plano contra un
 * fixture propio, para no depender del estado de deploy de la test DB.
 *
 * Ref spec: sdd/matriz-permisos-por-usuario/spec R8, S17.
 */
import * as fs from 'fs';
import * as path from 'path';
import { Pool } from 'pg';

const TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const MIGRATION_FILE = path.resolve(
  __dirname,
  './migrations/20260817120000_rename_modulo_soporte_a_tickets/migration.sql',
);

describe('Rename modulo SOPORTE→TICKETS en usuario_cliente_modulos (WU-7.2, master)', () => {
  let pool: Pool;
  let clienteId: string;
  let usuarioId: string;

  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_URL });
    await pool.query(
      'TRUNCATE TABLE usuario_cliente_modulos, membresias, usuarios, clientes RESTART IDENTITY CASCADE',
    );

    const cliente = await pool.query(
      `INSERT INTO clientes (id, nombre, db_name, updated_at)
       VALUES (gen_random_uuid(), 'Cliente rename test', 'test_rename_modulo', now())
       RETURNING id`,
    );
    clienteId = cliente.rows[0].id as string;

    const usuario = await pool.query(
      `INSERT INTO usuarios (id, email, nombre, apellido, password_hash, updated_at)
       VALUES (gen_random_uuid(), 'rename-modulo@test.local', 'Rename', 'Test', 'x', now())
       RETURNING id`,
    );
    usuarioId = usuario.rows[0].id as string;

    // Fixture: fila con el módulo VIEJO, más una fila de control con un
    // módulo que NO debe tocarse (S17: "afecta EXACTAMENTE esas filas").
    await pool.query(
      `INSERT INTO usuario_cliente_modulos (usuario_id, cliente_id, modulo)
       VALUES ($1, $2, 'SOPORTE'), ($1, $2, 'COMPRAS')`,
      [usuarioId, clienteId],
    );
  });

  afterAll(async () => {
    await pool.end();
  });

  it('[S17] UPDATE afecta exactamente las filas SOPORTE y no toca el resto', async () => {
    const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
    await pool.query(sql);

    const soporteRestante = await pool.query(
      `SELECT count(*)::int AS n FROM usuario_cliente_modulos WHERE modulo = 'SOPORTE'`,
    );
    expect(soporteRestante.rows[0].n).toBe(0);

    const filasDelFixture = await pool.query(
      `SELECT modulo FROM usuario_cliente_modulos WHERE usuario_id = $1 AND cliente_id = $2 ORDER BY modulo`,
      [usuarioId, clienteId],
    );
    expect(filasDelFixture.rows.map((r) => r.modulo as string)).toEqual(['COMPRAS', 'TICKETS']);
  });
});
