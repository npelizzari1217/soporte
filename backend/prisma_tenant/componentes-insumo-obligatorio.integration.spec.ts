/**
 * componentes-insumo-obligatorio.integration.spec.ts — WU-6 (sdd catalogo-unico-componentes, ADR-4).
 *
 * Contra Postgres REAL, base de INQUILINO EFÍMERA propia (molde
 * `scripts/limpiar-componentes-sin-insumo.integration.spec.ts`): nunca toca
 * `soporte_master`, `soporte_master_test` ni una base de tenant real, así que
 * no necesita `usarLockMasterTest()`. Reproduce el schema tenant hasta
 * `20260928150000` y corre después, a mano, la migración
 * `20260929120000_componentes_insumo_obligatorio`.
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
const ULTIMA_CARPETA_PREVIA = '20260928150000_calendario_laboral_dias_cliente';
const CARPETA_MIGRACION = '20260929120000_componentes_insumo_obligatorio';
const EPHEMERAL_DB_NAME = `soporte_comp_insumo_${randomBytes(4).toString('hex')}_test`;

const leerSql = (carpeta: string): string =>
  fs.readFileSync(path.join(TENANT_MIGRATIONS_DIR, carpeta, 'migration.sql'), 'utf8');

/** Corre, en orden, los `migration.sql` con carpeta <= `ULTIMA_CARPETA_PREVIA`. */
async function reproducirSchemaPrevio(pool: InstanceType<typeof Pool>): Promise<void> {
  const carpetas = fs
    .readdirSync(TENANT_MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entrada) => entrada.isDirectory())
    .map((entrada) => entrada.name)
    .filter((nombre) => nombre <= ULTIMA_CARPETA_PREVIA)
    .sort();

  for (const carpeta of carpetas) {
    await pool.query(leerSql(carpeta));
  }
}

describe('migración componentes_insumo_obligatorio — fail-closed (WU-6, tenant efímero)', () => {
  let pool: InstanceType<typeof Pool>;
  const admin = new PostgresAdminService(MASTER_TEST_URL);
  let equipoId: string;
  const sqlMigracion = leerSql(CARPETA_MIGRACION);

  const columnas = async (): Promise<Array<{ column_name: string; is_nullable: string }>> => {
    const { rows } = await pool.query(
      `SELECT column_name, is_nullable FROM information_schema.columns
       WHERE table_name = 'componentes_equipo'`,
    );
    return rows;
  };

  const insertar = async (tipo: string, borrada: boolean): Promise<void> => {
    await pool.query(
      `INSERT INTO componentes_equipo (equipo_id, tipo_componente_codigo, updated_at, deleted_at)
       VALUES ($1, $2, now(), ${borrada ? 'now()' : 'NULL'})`,
      [equipoId, tipo],
    );
  };

  /** El aborto deja el esquema como estaba: columna vieja presente e `insumo_id` aún NULL-able. */
  const esquemaIntacto = async (): Promise<void> => {
    const cols = await columnas();
    expect(cols.map((c) => c.column_name)).toContain('tipo_componente_codigo');
    expect(cols.find((c) => c.column_name === 'insumo_id')?.is_nullable).toBe('YES');
  };

  beforeAll(async () => {
    await admin.createDatabase(EPHEMERAL_DB_NAME);
    const ephemeralUrl = new URL(MASTER_TEST_URL);
    ephemeralUrl.pathname = `/${EPHEMERAL_DB_NAME}`;
    pool = new Pool({ connectionString: ephemeralUrl.toString() });

    await reproducirSchemaPrevio(pool);

    const equipo = await pool.query(
      `INSERT INTO equipos_informaticos (nombre, updated_at)
       VALUES ('Equipo fixture WU6', now()) RETURNING id`,
    );
    equipoId = equipo.rows[0].id as string;
  }, 120_000);

  afterAll(async () => {
    // Orden de higiene: limpiar filas -> cerrar -> dropDatabase (al revés, el DROP falla en silencio).
    await pool.query('DELETE FROM componentes_equipo').catch(() => undefined);
    await pool.end().catch(() => undefined);
    await admin.dropDatabase(EPHEMERAL_DB_NAME);
  }, 30_000);

  // Un test fallido no debe dejar filas que arrastren al siguiente.
  afterEach(async () => {
    await pool.query('DELETE FROM componentes_equipo');
  });

  it('aborta si hay una fila VIVA con insumo_id NULL, nombrando el script, y no toca el esquema', async () => {
    await insertar('RAM', false);

    await expect(pool.query(sqlMigracion)).rejects.toThrow(
      /1 fila\(s\) con insumo_id NULL.*backend\/scripts\/limpiar-componentes-sin-insumo\.mjs/s,
    );
    await esquemaIntacto();
  });

  it('aborta si la única fila con insumo_id NULL está borrada lógicamente', async () => {
    await insertar('DISCO', true);

    await expect(pool.query(sqlMigracion)).rejects.toThrow(/1 fila\(s\) con insumo_id NULL/);
    await esquemaIntacto();
  });

  it('con la tabla vacía pasa: insumo_id NOT NULL, sin columna de tipo, sin índice y FK RESTRICT', async () => {
    await pool.query(sqlMigracion);

    const cols = await columnas();
    expect(cols.map((c) => c.column_name)).not.toContain('tipo_componente_codigo');
    expect(cols.find((c) => c.column_name === 'insumo_id')?.is_nullable).toBe('NO');

    const indices = await pool.query(
      `SELECT indexname FROM pg_indexes
       WHERE tablename = 'componentes_equipo'
         AND indexname = 'componentes_equipo_tipo_componente_codigo_idx'`,
    );
    expect(indices.rowCount).toBe(0);

    // confdeltype 'r' = ON DELETE RESTRICT.
    const fk = await pool.query(
      `SELECT confdeltype FROM pg_constraint
       WHERE conrelid = 'componentes_equipo'::regclass
         AND contype = 'f'
         AND confrelid = 'insumos'::regclass`,
    );
    expect(fk.rows).toEqual([{ confdeltype: 'r' }]);
  });
});
