/**
 * movimientos-insumo-condicion.integration.spec.ts — sdd/stock-usado-componentes (WU-14, W3/W4 del verify).
 *
 * Contra Postgres REAL, base de INQUILINO EFIMERA propia (molde
 * `componentes-insumo-obligatorio.integration.spec.ts`): nunca toca
 * `soporte_master`, `soporte_master_test` ni una base de tenant real, asi que no
 * necesita `usarLockMasterTest()`. Reproduce el schema tenant hasta la migracion
 * anterior a `20260930120000_movimientos_insumo_condicion`, inserta movimientos
 * SIN la columna `condicion` y recien despues aplica la migracion a mano.
 *
 * Higiene: limpiar filas -> cerrar pool -> dropDatabase.
 */
import { Pool } from 'pg';
import { randomBytes } from 'node:crypto';
import * as fs from 'fs';
import * as path from 'path';
import { PostgresAdminService } from '../src/clientes/infrastructure/postgres-admin.service';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const TENANT_MIGRATIONS_DIR = path.resolve(__dirname, 'migrations');
const CARPETA_MIGRACION = '20260930120000_movimientos_insumo_condicion';
const EPHEMERAL_DB_NAME = `soporte_mov_cond_${randomBytes(4).toString('hex')}_test`;
const USUARIO_ID = '01900000-0000-7000-8000-000000000401';

const leerSql = (carpeta: string): string =>
  fs.readFileSync(path.join(TENANT_MIGRATIONS_DIR, carpeta, 'migration.sql'), 'utf8');

/** Corre, en orden, los `migration.sql` con carpeta ESTRICTAMENTE anterior a la migracion bajo prueba. */
async function reproducirSchemaPrevio(pool: InstanceType<typeof Pool>): Promise<void> {
  const carpetas = fs
    .readdirSync(TENANT_MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entrada) => entrada.isDirectory())
    .map((entrada) => entrada.name)
    .filter((nombre) => nombre < CARPETA_MIGRACION)
    .sort();

  for (const carpeta of carpetas) {
    await pool.query(leerSql(carpeta));
  }
}

describe('migracion movimientos_insumo_condicion sobre movimientos previos (WU-14, tenant efimero)', () => {
  let pool: InstanceType<typeof Pool>;
  const admin = new PostgresAdminService(MASTER_TEST_URL);
  let insumoId: string;

  beforeAll(async () => {
    await admin.createDatabase(EPHEMERAL_DB_NAME);
    const ephemeralUrl = new URL(MASTER_TEST_URL);
    ephemeralUrl.pathname = `/${EPHEMERAL_DB_NAME}`;
    pool = new Pool({ connectionString: ephemeralUrl.toString() });

    await reproducirSchemaPrevio(pool);

    const familia = await pool.query(
      `INSERT INTO familias_insumo (codigo, nombre, updated_at)
       VALUES ('F_MOV', 'Familia fixture WU14', now()) RETURNING id`,
    );
    const unidad = await pool.query(
      `INSERT INTO unidades_medida (codigo, nombre, updated_at)
       VALUES ('U_MOV', 'Unidad fixture WU14', now()) RETURNING id`,
    );
    const insumo = await pool.query(
      `INSERT INTO insumos (codigo, nombre, familia_id, unidad_medida_id, updated_at)
       VALUES ('I_MOV', 'Insumo fixture WU14', $1, $2, now()) RETURNING id`,
      [familia.rows[0].id, unidad.rows[0].id],
    );
    insumoId = insumo.rows[0].id as string;
  }, 120_000);

  afterAll(async () => {
    // Orden de higiene: limpiar filas -> cerrar -> dropDatabase (al revés, el DROP falla en silencio).
    await pool.query('DELETE FROM movimientos_insumo').catch(() => undefined);
    await pool.end().catch(() => undefined);
    await admin.dropDatabase(EPHEMERAL_DB_NAME);
  }, 30_000);

  it('las filas insertadas antes de la migracion quedan NUEVO y el saldo NUEVO iguala al stock previo', async () => {
    const movimientos: Array<[string, number]> = [
      ['ENTRADA', 10],
      ['SALIDA', 3],
      ['AJUSTE_POSITIVO', 2],
      ['AJUSTE_NEGATIVO', 1],
    ];
    for (const [tipo, cantidad] of movimientos) {
      // AJUSTE exige motivo por dominio, no por base; se manda igual para reflejar una fila real.
      await pool.query(
        `INSERT INTO movimientos_insumo (insumo_id, tipo, cantidad, usuario_id, motivo)
         VALUES ($1, $2, $3, $4, 'fixture')`,
        [insumoId, tipo, cantidad, USUARIO_ID],
      );
    }
    const stockPrevio = 10 - 3 + 2 - 1;

    // Precondicion: la columna todavia no existe (si existiera, el test no probaria la migracion).
    const antes = await pool.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_name = 'movimientos_insumo' AND column_name = 'condicion'`,
    );
    expect(antes.rowCount).toBe(0);

    await pool.query(leerSql(CARPETA_MIGRACION));

    const filas = await pool.query(
      'SELECT tipo, cantidad, condicion FROM movimientos_insumo WHERE insumo_id = $1',
      [insumoId],
    );
    expect(filas.rowCount).toBe(movimientos.length);
    expect(filas.rows.every((f) => f.condicion === 'NUEVO')).toBe(true);

    const saldoNuevo = await pool.query(
      `SELECT COALESCE(SUM(CASE WHEN tipo IN ('ENTRADA', 'AJUSTE_POSITIVO') THEN cantidad ELSE -cantidad END), 0)::float AS saldo
       FROM movimientos_insumo WHERE insumo_id = $1 AND condicion = 'NUEVO'`,
      [insumoId],
    );
    expect(saldoNuevo.rows[0].saldo).toBe(stockPrevio);

    const saldoUsado = await pool.query(
      `SELECT count(*)::int AS n FROM movimientos_insumo WHERE insumo_id = $1 AND condicion = 'USADO'`,
      [insumoId],
    );
    expect(saldoUsado.rows[0].n).toBe(0);
  });
});
