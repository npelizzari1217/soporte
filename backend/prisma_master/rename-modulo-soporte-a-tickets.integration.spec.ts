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
 * DB EFÍMERA (fix schema-drift, sdd/converger-schema-master-con-produccion):
 * `usuario_cliente_modulos` ya NO existe en `soporte_master_test` una vez
 * aplicada la migración `20260817180000_drop_legacy_rbac_tablas_muertas`
 * (converge el schema con el DROP que WU-9 ya había corrido en producción
 * vía script standalone). Este fixture necesita esa tabla como INPUT del
 * rename bajo test — no puede correr contra la DB compartida post-DROP. Se
 * crea una DB efímera propia y se reproduce el schema SOLO hasta justo antes
 * del rename (que a su vez es anterior al DROP).
 *
 * Ref spec: sdd/matriz-permisos-por-usuario/spec R8, S17.
 */
import * as fs from 'fs';
import * as path from 'path';
import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { PostgresAdminService } from '../src/clientes/infrastructure/postgres-admin.service';

const TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const MASTER_MIGRATIONS_DIR = path.resolve(__dirname, './migrations');
// Última carpeta que este spec necesita reproducir ANTES del rename bajo
// test — cualquier carpeta posterior (incl. el DROP) queda AFUERA.
const ULTIMA_CARPETA_PREVIA = '20260816220000_backfill_matriz_permisos';
const EPHEMERAL_DB_NAME = `soporte_rename_modulo_${randomBytes(4).toString('hex')}_test`;

/** Corre, en orden, los `migration.sql` con carpeta <= `ULTIMA_CARPETA_PREVIA`. */
async function reproducirSchemaPrevio(pool: InstanceType<typeof Pool>): Promise<void> {
  const carpetas = fs
    .readdirSync(MASTER_MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entrada) => entrada.isDirectory())
    .map((entrada) => entrada.name)
    .filter((nombre) => nombre <= ULTIMA_CARPETA_PREVIA)
    .sort();

  for (const carpeta of carpetas) {
    const sql = fs.readFileSync(path.join(MASTER_MIGRATIONS_DIR, carpeta, 'migration.sql'), 'utf8');
    await pool.query(sql);
  }
}

const MIGRATION_FILE = path.resolve(
  __dirname,
  './migrations/20260817120000_rename_modulo_soporte_a_tickets/migration.sql',
);

describe('Rename modulo SOPORTE→TICKETS en usuario_cliente_modulos (WU-7.2, master)', () => {
  let pool: Pool;
  const admin = new PostgresAdminService(TEST_URL);
  let clienteId: string;
  let usuarioId: string;

  beforeAll(async () => {
    await admin.createDatabase(EPHEMERAL_DB_NAME);
    const ephemeralUrl = new URL(TEST_URL);
    ephemeralUrl.pathname = `/${EPHEMERAL_DB_NAME}`;
    pool = new Pool({ connectionString: ephemeralUrl.toString() });

    // Reproduce el schema justo antes del rename bajo test — DB efímera y
    // recién creada, no hace falta TRUNCATE previo.
    await reproducirSchemaPrevio(pool);

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
  }, 60_000);

  afterAll(async () => {
    await pool.end().catch(() => undefined);
    await admin.dropDatabase(EPHEMERAL_DB_NAME);
  }, 30_000);

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
