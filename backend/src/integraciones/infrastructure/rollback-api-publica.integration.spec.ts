/**
 * `rollback.sql` de la migracion `20261011120000_api_publica` contra `soporte_master_test`: los
 * usuarios de integracion quedan DESACTIVADOS (usuario y membresias), no borrados, y el resto de
 * los usuarios no se toca. Se puede correr dos veces seguidas (CA5 de
 * `odd/tasks/deuda-tecnica-2026-10-15.md`). Al final la base vuelve SIEMPRE al esquema migrado,
 * porque es compartida.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { URL_MASTER_TEST_POR_DEFECTO, usarLockMasterTest } from '../../testing/lock-master-test';

const URL_MASTER = process.env.DATABASE_URL_MASTER ?? URL_MASTER_TEST_POR_DEFECTO;
const CARPETA = path.resolve(
  __dirname,
  '../../../prisma_master/migrations/20261011120000_api_publica',
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

describe('rollback.sql de api_publica', () => {
  let pool: InstanceType<typeof Pool>;
  const s = randomBytes(6).toString('hex');
  let clienteId = '';
  let rolId = '';
  let integracionId = '';
  let normalId = '';

  const ejecutar = async (archivo: string): Promise<void> => {
    for (const sentencia of sentencias(archivo)) await pool.query(sentencia);
  };

  const esquema = async (): Promise<{ tabla: boolean; usuario: boolean; cliente: boolean }> => {
    const r = await pool.query(
      `SELECT to_regclass('public.api_claves') IS NOT NULL AS tabla,
              EXISTS (SELECT 1 FROM information_schema.columns
                      WHERE table_name = 'usuarios' AND column_name = 'es_integracion') AS usuario,
              EXISTS (SELECT 1 FROM information_schema.columns
                      WHERE table_name = 'clientes' AND column_name = 'api_habilitada') AS cliente`,
    );
    const { tabla, usuario, cliente } = r.rows[0];
    return { tabla, usuario, cliente };
  };

  const esquemaMigrado = async (): Promise<boolean> => {
    const { tabla, usuario, cliente } = await esquema();
    return tabla && usuario && cliente;
  };

  // Desde cualquier estado parcial: deshace lo que quede y vuelve a migrar.
  const restaurarEsquema = async (): Promise<void> => {
    if (await esquemaMigrado()) return;
    await pool.query('DROP TABLE IF EXISTS "api_claves"');
    await pool.query('ALTER TABLE "usuarios" DROP COLUMN IF EXISTS "es_integracion"');
    await pool.query('ALTER TABLE "clientes" DROP COLUMN IF EXISTS "api_habilitada"');
    await ejecutar('migration.sql');
  };

  const crearUsuario = async (nombre: string, esIntegracion: boolean): Promise<string> => {
    const r = await pool.query(
      `INSERT INTO usuarios (email, nombre, apellido, password_hash, es_integracion, updated_at)
       VALUES ($1, $2, 'Rollback', 'x', $3, now()) RETURNING id`,
      [`${nombre}-${s}@test.local`, nombre, esIntegracion],
    );
    await pool.query(
      `INSERT INTO membresias (usuario_id, cliente_id, rol_id, updated_at)
       VALUES ($1, $2, $3, now())`,
      [r.rows[0].id, clienteId, rolId],
    );
    return r.rows[0].id;
  };

  const estado = async (usuarioId: string) => {
    const u = await pool.query('SELECT activo FROM usuarios WHERE id = $1', [usuarioId]);
    const m = await pool.query('SELECT activo FROM membresias WHERE usuario_id = $1', [usuarioId]);
    return { usuario: u.rows.map((f) => f.activo), membresias: m.rows.map((f) => f.activo) };
  };

  beforeAll(async () => {
    pool = new Pool({ connectionString: URL_MASTER });
    await restaurarEsquema();
    const c = await pool.query(
      'INSERT INTO clientes (nombre, db_name, updated_at) VALUES ($1, $2, now()) RETURNING id',
      [`Cliente ${s}`, `db_rollback_api_${s}`],
    );
    clienteId = c.rows[0].id;
    const r = await pool.query(
      `INSERT INTO roles (codigo, nombre, updated_at) VALUES ($1, 'Rol rollback', now()) RETURNING id`,
      [`ROLLBACK_API_${s}`],
    );
    rolId = r.rows[0].id;
    integracionId = await crearUsuario('integracion', true);
    normalId = await crearUsuario('normal', false);
  });

  afterAll(async () => {
    try {
      await restaurarEsquema();
      const ids = [integracionId, normalId].filter(Boolean);
      await pool.query('DELETE FROM membresias WHERE usuario_id = ANY($1)', [ids]);
      await pool.query('DELETE FROM usuarios WHERE id = ANY($1)', [ids]);
      if (rolId) await pool.query('DELETE FROM roles WHERE id = $1', [rolId]);
      if (clienteId) await pool.query('DELETE FROM clientes WHERE id = $1', [clienteId]);
    } finally {
      await pool.end();
    }
  });

  it('desactiva al usuario de integracion y sus membresias sin borrarlo, y no toca a los demas', async () => {
    try {
      await ejecutar('rollback.sql');

      expect(await estado(integracionId)).toEqual({ usuario: [false], membresias: [false] });
      expect(await estado(normalId)).toEqual({ usuario: [true], membresias: [true] });
    } finally {
      await restaurarEsquema();
    }
  });

  it('despues del rollback, migration.sql deja la base otra vez en el esquema migrado', async () => {
    try {
      await ejecutar('rollback.sql');
      expect(await esquemaMigrado()).toBe(false);
      await ejecutar('migration.sql');
      expect(await esquemaMigrado()).toBe(true);
    } finally {
      await restaurarEsquema();
    }
  });

  it('correrlo dos veces seguidas no falla y deja el mismo esquema y los mismos usuarios que una', async () => {
    try {
      await ejecutar('rollback.sql');
      const esquemaUnaVez = await esquema();
      const usuariosUnaVez = [await estado(integracionId), await estado(normalId)];

      await expect(ejecutar('rollback.sql')).resolves.toBeUndefined();

      expect(esquemaUnaVez).toEqual({ tabla: false, usuario: false, cliente: false });
      expect(await esquema()).toEqual(esquemaUnaVez);
      expect([await estado(integracionId), await estado(normalId)]).toEqual(usuariosUnaVez);
    } finally {
      await restaurarEsquema();
    }
  });
});
