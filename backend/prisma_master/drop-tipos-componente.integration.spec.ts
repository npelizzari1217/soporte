/**
 * drop-tipos-componente.integration.spec.ts — cierre de verify de
 * catalogo-unico-componentes (escenario "Tabla MASTER eliminada").
 *
 * Contra Postgres REAL, base EFÍMERA propia (molde
 * `add-cliente-smtp-config.integration.spec.ts`): reproduce TODAS las migraciones master
 * en orden y verifica que la tabla `tipos_componente` no existe al final. Falla si se
 * borra la migración `20260929130000_drop_tipos_componente` o si una posterior la recrea.
 * No toca `soporte_master_test`, así que no necesita `usarLockMasterTest()`.
 *
 * Higiene: cerrar pool -> dropDatabase.
 */
import { Pool } from 'pg';
import { randomBytes } from 'node:crypto';
import * as fs from 'fs';
import * as path from 'path';
import { PostgresAdminService } from '../src/clientes/infrastructure/postgres-admin.service';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const MASTER_MIGRATIONS_DIR = path.resolve(__dirname, './migrations');
const EPHEMERAL_DB_NAME = `soporte_drop_tipos_comp_${randomBytes(4).toString('hex')}_test`;

describe('migraciones master — tabla tipos_componente eliminada', () => {
  let pool: InstanceType<typeof Pool>;
  const admin = new PostgresAdminService(MASTER_TEST_URL);

  beforeAll(async () => {
    await admin.createDatabase(EPHEMERAL_DB_NAME);
    const url = new URL(MASTER_TEST_URL);
    url.pathname = `/${EPHEMERAL_DB_NAME}`;
    pool = new Pool({ connectionString: url.toString() });

    const carpetas = fs
      .readdirSync(MASTER_MIGRATIONS_DIR, { withFileTypes: true })
      .filter((entrada) => entrada.isDirectory())
      .map((entrada) => entrada.name)
      .sort();
    for (const carpeta of carpetas) {
      await pool.query(
        fs.readFileSync(path.join(MASTER_MIGRATIONS_DIR, carpeta, 'migration.sql'), 'utf8'),
      );
    }
  }, 120_000);

  afterAll(async () => {
    await pool.end().catch(() => undefined);
    await admin.dropDatabase(EPHEMERAL_DB_NAME);
  }, 30_000);

  it('tras aplicar todas las migraciones, to_regclass(tipos_componente) es NULL', async () => {
    const { rows } = await pool.query(
      `SELECT to_regclass('public.tipos_componente') AS tabla`,
    );
    expect(rows[0].tabla).toBeNull();
  });

  it('el historial incluye la migración que la elimina', () => {
    expect(
      fs.existsSync(
        path.join(MASTER_MIGRATIONS_DIR, '20260929130000_drop_tipos_componente', 'migration.sql'),
      ),
    ).toBe(true);
  });
});
