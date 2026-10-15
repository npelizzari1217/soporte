/**
 * `rollback.sql` de la migracion `20261015120000_throttler_contadores` contra
 * `soporte_master_test` (CA6): borra la tabla, se puede correr dos veces seguidas y la migracion
 * vuelve a aplicarse encima. Al final la base vuelve SIEMPRE al esquema migrado, porque es
 * compartida.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Pool } from 'pg';
import { URL_MASTER_TEST_POR_DEFECTO, usarLockMasterTest } from '../../../testing/lock-master-test';

const URL_MASTER = process.env.DATABASE_URL_MASTER ?? URL_MASTER_TEST_POR_DEFECTO;
const CARPETA = path.resolve(
  __dirname,
  '../../../../prisma_master/migrations/20261015120000_throttler_contadores',
);

const sentencias = (archivo: string): string[] =>
  fs
    .readFileSync(path.join(CARPETA, archivo), 'utf8')
    .split('\n')
    .filter((linea) => !linea.startsWith('--'))
    .join('\n')
    .split(';')
    .map((sentencia) => sentencia.trim())
    .filter(Boolean);

usarLockMasterTest();

describe('rollback.sql de throttler_contadores', () => {
  let pool: InstanceType<typeof Pool>;

  const ejecutar = async (archivo: string): Promise<void> => {
    for (const sentencia of sentencias(archivo)) await pool.query(sentencia);
  };

  const tablaExiste = async (): Promise<boolean> => {
    const r = await pool.query(
      `SELECT to_regclass('public.throttler_contadores') IS NOT NULL AS existe`,
    );
    return r.rows[0].existe;
  };

  beforeAll(() => {
    pool = new Pool({ connectionString: URL_MASTER });
  });

  afterAll(async () => {
    try {
      if (!(await tablaExiste())) await ejecutar('migration.sql');
    } finally {
      await pool.end();
    }
  });

  it('borra la tabla, es re-ejecutable y la migracion se reaplica encima', async () => {
    expect(await tablaExiste()).toBe(true);

    await ejecutar('rollback.sql');
    expect(await tablaExiste()).toBe(false);
    await ejecutar('rollback.sql');
    expect(await tablaExiste()).toBe(false);

    await ejecutar('migration.sql');
    expect(await tablaExiste()).toBe(true);
  });
});
