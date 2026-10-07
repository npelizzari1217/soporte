/**
 * rotar-email-crypto-key.proceso.spec.ts — WU2b (sdd/rotacion-email-crypto-key).
 *
 * Único caso de la matriz de amenazas del diseño con applicability real: el
 * paso de secretos al proceso hijo (ADR-3). Spawnea el script REAL
 * (`spawn(process.execPath, [script])`, nunca `import`) contra una DB
 * efímera propia, molde `rotar-email-crypto-key.integration.spec.ts` (WU2a).
 * Cada caso confirma el exit code y que ninguna clave ni texto plano
 * aparece en stdout+stderr combinados.
 *
 * Ref design: ADR-3, Threat Matrix. Ref tasks: 2b.3.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import * as fs from 'fs';
import * as path from 'path';
import { Pool } from 'pg';
import { PostgresAdminService } from '../src/clientes/infrastructure/postgres-admin.service';
import { cifrarV1 } from './lib/cifrado-secreto-v1.mjs';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';
const MASTER_MIGRATIONS_DIR = path.resolve(__dirname, '../prisma_master/migrations');
const ULTIMA_CARPETA_PREVIA = '20261008120000_verificacion_dos_pasos';
const EPHEMERAL_DB_NAME = `soporte_rotacion_proceso_${randomBytes(4).toString('hex')}_test`;
const SCRIPT_PATH = path.resolve(__dirname, 'rotar-email-crypto-key.mjs');

const OLD_KEY_HEX = 'd'.repeat(64);
const NEW_KEY_HEX = 'e'.repeat(64);
const OTRA_KEY_HEX = 'f'.repeat(64);
const oldKeyBuf = Buffer.from(OLD_KEY_HEX, 'hex');
const newKeyBuf = Buffer.from(NEW_KEY_HEX, 'hex');
const otraKeyBuf = Buffer.from(OTRA_KEY_HEX, 'hex');
const SECRETOS_PROHIBIDOS = [OLD_KEY_HEX, NEW_KEY_HEX, OTRA_KEY_HEX];

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

async function insertarCliente(
  pool: InstanceType<typeof Pool>,
  id: string,
  nombre: string,
  payload: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO clientes (id, nombre, db_name, updated_at, smtp_host, smtp_port, smtp_user, smtp_from, smtp_password_cifrada)
     VALUES ($1, $2, $3, now(), 'smtp.test.local', 587, 'user@test.local', 'from@test.local', $4)`,
    [id, nombre, `db_${nombre}`, payload],
  );
}

/** Spawnea el script real y combina stdout+stderr en un solo string. */
function correrScript(
  args: string[],
  env: Record<string, string>,
): Promise<{ exitCode: number | null; salida: string }> {
  return new Promise((resolve, reject) => {
    const hijo = spawn(process.execPath, [SCRIPT_PATH, ...args], {
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let salida = '';
    hijo.stdout.on('data', (chunk: Buffer) => (salida += chunk.toString()));
    hijo.stderr.on('data', (chunk: Buffer) => (salida += chunk.toString()));
    hijo.on('error', reject);
    hijo.on('close', (exitCode) => resolve({ exitCode, salida }));
  });
}

/** Confirma que ni las claves de prueba ni el texto plano viajan en la salida. */
function assertSinSecretos(salida: string, textoPlano: string): void {
  expect(salida).not.toContain(textoPlano);
  for (const secreto of SECRETOS_PROHIBIDOS) {
    expect(salida).not.toContain(secreto);
  }
}

describe('rotar-email-crypto-key.mjs — proceso real (WU2b, ADR-3)', () => {
  let pool: InstanceType<typeof Pool>;
  let ephemeralUrl: string;
  const admin = new PostgresAdminService(MASTER_TEST_URL);

  beforeAll(async () => {
    await admin.createDatabase(EPHEMERAL_DB_NAME);
    const url = new URL(MASTER_TEST_URL);
    url.pathname = `/${EPHEMERAL_DB_NAME}`;
    ephemeralUrl = url.toString();
    pool = new Pool({ connectionString: ephemeralUrl });
    await reproducirSchemaPrevio(pool);
  }, 60_000);

  afterAll(async () => {
    await pool.end().catch(() => undefined);
    await admin.dropDatabase(EPHEMERAL_DB_NAME);
  }, 30_000);

  afterEach(async () => {
    await pool.query('DELETE FROM clientes');
    await pool.query('DELETE FROM usuarios'); // borra usuarios_tfa en cascada
  });

  const envRotar = (): Record<string, string> => ({
    DATABASE_URL_MASTER: ephemeralUrl,
    ROTACION_OLD_KEY: OLD_KEY_HEX,
    ROTACION_NEW_KEY: NEW_KEY_HEX,
  });
  const envVerificar = (): Record<string, string> => ({
    DATABASE_URL_MASTER: ephemeralUrl,
    ROTACION_VERIFICAR_KEY: NEW_KEY_HEX,
  });

  it('rotación: éxito y re-corrida no-op, ambas exit 0, sin secretos en la salida', async () => {
    const id = randomUUID();
    const textoPlano = 'secreto-proceso';
    await insertarCliente(pool, id, 'proceso-exito', cifrarV1(oldKeyBuf, textoPlano, id));

    const primera = await correrScript([], envRotar());
    expect(primera.exitCode).toBe(0);
    assertSinSecretos(primera.salida, textoPlano);

    const segunda = await correrScript([], envRotar()); // no-op: ya quedó en NEW_KEY
    expect(segunda.exitCode).toBe(0);
    assertSinSecretos(segunda.salida, textoPlano);
  });

  it('rotación y --verificar cubren los secretos TOTP: exit 0 y salida con los totales (K1, K3)', async () => {
    const id = randomUUID();
    const textoPlano = 'secreto-totp-proceso';
    await pool.query(
      `INSERT INTO usuarios (id, email, nombre, apellido, password_hash, updated_at)
       VALUES ($1, $2, 'T', 'F', 'x', now())`,
      [id, `${id}@tfa.test`],
    );
    await pool.query(
      `INSERT INTO usuarios_tfa (usuario_id, secreto_cifrado, confirmado_at, updated_at)
       VALUES ($1, $2, now(), now())`,
      [id, cifrarV1(oldKeyBuf, textoPlano, `tfa:${id}`)],
    );

    const rotacion = await correrScript([], envRotar());
    expect(rotacion.exitCode).toBe(0);
    expect(rotacion.salida).toContain('migradas=1 ya_migradas=0');
    assertSinSecretos(rotacion.salida, textoPlano);

    const verificacion = await correrScript(['--verificar'], envVerificar());
    expect(verificacion.exitCode).toBe(0);
    assertSinSecretos(verificacion.salida, textoPlano);
  });

  it('rotación con fila indescifrable: exit 3, sin secretos en la salida', async () => {
    const id = randomUUID();
    const textoPlano = 'secreto-fallo';
    await insertarCliente(pool, id, 'proceso-fallo', cifrarV1(otraKeyBuf, textoPlano, id));

    const resultado = await correrScript([], envRotar());
    expect(resultado.exitCode).toBe(3);
    assertSinSecretos(resultado.salida, textoPlano);
  });

  it('--verificar exitoso: exit 0, sin secretos en la salida', async () => {
    const id = randomUUID();
    const textoPlano = 'secreto-verificar-ok';
    await insertarCliente(pool, id, 'proceso-verificar-ok', cifrarV1(newKeyBuf, textoPlano, id));

    const resultado = await correrScript(['--verificar'], envVerificar());
    expect(resultado.exitCode).toBe(0);
    assertSinSecretos(resultado.salida, textoPlano);
  });

  it('--verificar fallido: exit ≠0, sin secretos en la salida', async () => {
    const id = randomUUID();
    const textoPlano = 'secreto-verificar-mal';
    await insertarCliente(pool, id, 'proceso-verificar-mal', cifrarV1(otraKeyBuf, textoPlano, id));

    const resultado = await correrScript(['--verificar'], envVerificar());
    expect(resultado.exitCode).toBe(3);
    assertSinSecretos(resultado.salida, textoPlano);
  });

  it('entrada inválida: exit 2 antes de conectar, sin secretos en la salida', async () => {
    const claveMala = await correrScript([], { ...envRotar(), ROTACION_NEW_KEY: 'no-es-hex' });
    expect(claveMala.exitCode).toBe(2);
    assertSinSecretos(claveMala.salida, 'no-es-hex');

    const flagsExcluyentes = await correrScript(['--dry-run', '--verificar'], envVerificar());
    expect(flagsExcluyentes.exitCode).toBe(2);
    assertSinSecretos(flagsExcluyentes.salida, NEW_KEY_HEX);
  });
});
