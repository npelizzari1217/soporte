/**
 * rotar-email-crypto-key.integration.spec.ts — WU2a (sdd/rotacion-email-crypto-key).
 *
 * Contra Postgres REAL, DB EFÍMERA propia (molde
 * `backfill-correo-clientes.integration.spec.ts`) — nunca toca
 * `soporte_master` ni `soporte_master_test`, así que no necesita
 * `usarLockMasterTest()` (Testing Strategy de design.md).
 *
 * Cubre `ejecutarRotacion()`: rotación completa, `ROLLBACK` ante fila
 * indescifrable, `--dry-run` sin escritura, re-corrida no-op, filas mixtas
 * OLD/NEW, filas `NULL` intactas, AAD ligado por fila, y round-trip fallido
 * inyectado vía `deps.cifrar` → `ROLLBACK` total. También cubre
 * `ejecutarVerificacion()` (WU2b, 2b.1-2b.2): todas las filas descifran con
 * la clave dada (exit 0, sin escritura) y al menos una no descifra
 * (exit ≠0, sin escritura).
 *
 * Ref design: ADR-1, ADR-2. Ref tasks: 2a.4, 2b.2.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import * as fs from 'fs';
import * as path from 'path';
import { Pool } from 'pg';
import { PostgresAdminService } from '../src/clientes/infrastructure/postgres-admin.service';
import { cifrarV1, descifrarV1, leerClaveHex } from './lib/cifrado-secreto-v1.mjs';
import { ejecutarRotacion, ejecutarVerificacion } from './rotar-email-crypto-key.mjs';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const MASTER_MIGRATIONS_DIR = path.resolve(__dirname, '../prisma_master/migrations');
// Reproducimos el schema hasta la migración de `usuarios_tfa` incluida (destinos
// TOTP de la rotación), porque acá probamos la rotación, no las migraciones.
const ULTIMA_CARPETA_PREVIA = '20261008120000_verificacion_dos_pasos';
const EPHEMERAL_DB_NAME = `soporte_rotacion_email_${randomBytes(4).toString('hex')}_test`;

const OLD_KEY_HEX = 'a'.repeat(64);
const NEW_KEY_HEX = 'b'.repeat(64);
const OTRA_KEY_HEX = 'c'.repeat(64);
const oldKeyBuf = leerClaveHex(OLD_KEY_HEX) as Buffer;
const newKeyBuf = leerClaveHex(NEW_KEY_HEX) as Buffer;
const otraKeyBuf = leerClaveHex(OTRA_KEY_HEX) as Buffer;

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

/** Inserta una fila de `clientes` con `id` conocido de antemano (para poder usarlo como AAD). */
async function insertarCliente(
  pool: InstanceType<typeof Pool>,
  id: string,
  nombre: string,
  payload: string | null,
): Promise<void> {
  if (payload === null) {
    await pool.query(
      `INSERT INTO clientes (id, nombre, db_name, updated_at) VALUES ($1, $2, $3, now())`,
      [id, nombre, `db_${nombre}`],
    );
    return;
  }
  await pool.query(
    `INSERT INTO clientes (id, nombre, db_name, updated_at, smtp_host, smtp_port, smtp_user, smtp_from, smtp_password_cifrada)
     VALUES ($1, $2, $3, now(), 'smtp.test.local', 587, 'user@test.local', 'from@test.local', $4)`,
    [id, nombre, `db_${nombre}`, payload],
  );
}

/** Inserta un usuario con su fila de 2FA; `activo`/`pendiente` null dejan la columna en NULL. */
async function insertarUsuarioTfa(
  pool: InstanceType<typeof Pool>,
  id: string,
  activo: string | null,
  pendiente: string | null,
): Promise<void> {
  await pool.query(
    `INSERT INTO usuarios (id, email, nombre, apellido, password_hash, updated_at)
     VALUES ($1, $2, 'T', 'F', 'x', now())`,
    [id, `${id}@tfa.test`],
  );
  await pool.query(
    `INSERT INTO usuarios_tfa (usuario_id, secreto_cifrado, confirmado_at, secreto_pendiente_cifrado, pendiente_creado_at, updated_at)
     VALUES ($1, $2, CASE WHEN $2::text IS NULL THEN NULL ELSE now() END, $3, CASE WHEN $3::text IS NULL THEN NULL ELSE now() END, now())`,
    [id, activo, pendiente],
  );
}

async function leerTfa(
  pool: InstanceType<typeof Pool>,
  id: string,
): Promise<{ secreto_cifrado: string | null; secreto_pendiente_cifrado: string | null }> {
  const { rows } = await pool.query(
    `SELECT secreto_cifrado, secreto_pendiente_cifrado FROM usuarios_tfa WHERE usuario_id = $1`,
    [id],
  );
  return rows[0];
}

describe('rotar-email-crypto-key — ejecutarRotacion() (WU2a, master)', () => {
  let pool: InstanceType<typeof Pool>;
  const admin = new PostgresAdminService(MASTER_TEST_URL);

  beforeAll(async () => {
    await admin.createDatabase(EPHEMERAL_DB_NAME);
    const ephemeralUrl = new URL(MASTER_TEST_URL);
    ephemeralUrl.pathname = `/${EPHEMERAL_DB_NAME}`;
    pool = new Pool({ connectionString: ephemeralUrl.toString() });
    await reproducirSchemaPrevio(pool);
  }, 60_000);

  afterAll(async () => {
    await pool.end().catch(() => undefined);
    await admin.dropDatabase(EPHEMERAL_DB_NAME);
  }, 30_000);

  // Cada test corre `ejecutarRotacion()` contra TODA la tabla `clientes` de
  // esta DB efímera (no filtra por lo que insertó el test), así que una fila
  // `indescifrable` o ya migrada que sobreviviera a un test forzaría
  // `ROLLBACK` (o cambiaría los contadores) en el siguiente. `DELETE` deja
  // cada test con la tabla vacía sin chocar contra el FK de `membresias`
  // (`TRUNCATE` sin `CASCADE` lo rechaza); no hace falta `usarLockMasterTest()`
  // porque esta DB nunca es `soporte_master_test`.
  afterEach(async () => {
    await pool.query('DELETE FROM clientes');
    await pool.query('DELETE FROM usuarios'); // borra usuarios_tfa en cascada
  });

  it('rotación completa: filas OLD_KEY pasan a NEW_KEY, AAD = id, texto plano preservado', async () => {
    const idA = randomUUID();
    const idB = randomUUID();
    await insertarCliente(pool, idA, 'completa-a', cifrarV1(oldKeyBuf, 'secreto-a', idA));
    await insertarCliente(pool, idB, 'completa-b', cifrarV1(oldKeyBuf, 'secreto-b', idB));

    const resultado = await ejecutarRotacion(pool, { oldKeyBuf, newKeyBuf, modo: 'rotar' });
    expect(resultado).toMatchObject({ exitCode: 0, migradas: 2, yaMigradas: 0 });

    const { rows } = await pool.query(
      `SELECT id, smtp_password_cifrada FROM clientes WHERE id = ANY($1) ORDER BY id`,
      [[idA, idB]],
    );
    for (const fila of rows) {
      expect(descifrarV1(newKeyBuf, fila.smtp_password_cifrada, fila.id)).toMatch(/^secreto-/);
      expect(() => descifrarV1(oldKeyBuf, fila.smtp_password_cifrada, fila.id)).toThrow();
    }
  });

  it('fila indescifrable: ROLLBACK total, incluida una fila pendiente en la misma corrida', async () => {
    const idPendiente = randomUUID();
    const idIndescifrable = randomUUID();
    const payloadPendienteOriginal = cifrarV1(oldKeyBuf, 'secreto-pendiente', idPendiente);
    const payloadIndescifrable = cifrarV1(otraKeyBuf, 'secreto-ajeno', idIndescifrable);
    await insertarCliente(pool, idPendiente, 'indescifrable-pendiente', payloadPendienteOriginal);
    await insertarCliente(pool, idIndescifrable, 'indescifrable-fila', payloadIndescifrable);

    const resultado = await ejecutarRotacion(pool, { oldKeyBuf, newKeyBuf, modo: 'rotar' });
    expect(resultado).toMatchObject({ exitCode: 3 });

    const { rows } = await pool.query(
      `SELECT id, smtp_password_cifrada FROM clientes WHERE id = ANY($1) ORDER BY id`,
      [[idPendiente, idIndescifrable]],
    );
    const pendiente = rows.find((r) => r.id === idPendiente);
    const indescifrable = rows.find((r) => r.id === idIndescifrable);
    expect(pendiente.smtp_password_cifrada).toBe(payloadPendienteOriginal);
    expect(indescifrable.smtp_password_cifrada).toBe(payloadIndescifrable);
  });

  it('--dry-run: reporta éxito sin persistir ningún cambio (payload idéntico byte a byte)', async () => {
    const id = randomUUID();
    const payloadOriginal = cifrarV1(oldKeyBuf, 'secreto-dry-run', id);
    await insertarCliente(pool, id, 'dry-run', payloadOriginal);

    const resultado = await ejecutarRotacion(pool, { oldKeyBuf, newKeyBuf, modo: 'dry-run' });
    expect(resultado).toMatchObject({ exitCode: 0, migradas: 1, yaMigradas: 0 });

    const { rows } = await pool.query(`SELECT smtp_password_cifrada FROM clientes WHERE id = $1`, [
      id,
    ]);
    expect(rows[0].smtp_password_cifrada).toBe(payloadOriginal);
  });

  it('re-corrida: la segunda vez sobre una fila ya migrada es no-op', async () => {
    const id = randomUUID();
    await insertarCliente(pool, id, 're-corrida', cifrarV1(oldKeyBuf, 'secreto-re-corrida', id));

    const primera = await ejecutarRotacion(pool, { oldKeyBuf, newKeyBuf, modo: 'rotar' });
    expect(primera).toMatchObject({ exitCode: 0, migradas: 1 });

    const { rows: trasPrimera } = await pool.query(
      `SELECT smtp_password_cifrada FROM clientes WHERE id = $1`,
      [id],
    );
    const payloadMigrado = trasPrimera[0].smtp_password_cifrada;

    const segunda = await ejecutarRotacion(pool, { oldKeyBuf, newKeyBuf, modo: 'rotar' });
    expect(segunda).toMatchObject({ exitCode: 0, migradas: 0 });

    const { rows: trasSegunda } = await pool.query(
      `SELECT smtp_password_cifrada FROM clientes WHERE id = $1`,
      [id],
    );
    expect(trasSegunda[0].smtp_password_cifrada).toBe(payloadMigrado);
  });

  it('filas mixtas OLD/NEW: migra solo la pendiente y deja intacta la ya migrada', async () => {
    const idPendiente = randomUUID();
    const idYaMigrada = randomUUID();
    await insertarCliente(
      pool,
      idPendiente,
      'mixta-pendiente',
      cifrarV1(oldKeyBuf, 'secreto-p', idPendiente),
    );
    const payloadYaMigrado = cifrarV1(newKeyBuf, 'secreto-ya', idYaMigrada);
    await insertarCliente(pool, idYaMigrada, 'mixta-migrada', payloadYaMigrado);

    const resultado = await ejecutarRotacion(pool, { oldKeyBuf, newKeyBuf, modo: 'rotar' });
    expect(resultado).toMatchObject({ exitCode: 0, migradas: 1, yaMigradas: 1 });

    const { rows } = await pool.query(`SELECT smtp_password_cifrada FROM clientes WHERE id = $1`, [
      idYaMigrada,
    ]);
    expect(rows[0].smtp_password_cifrada).toBe(payloadYaMigrado);
  });

  it('fila con smtp_password_cifrada NULL: no se cuenta ni se modifica', async () => {
    const id = randomUUID();
    await insertarCliente(pool, id, 'sin-config', null);

    const resultado = await ejecutarRotacion(pool, { oldKeyBuf, newKeyBuf, modo: 'rotar' });
    expect(resultado.exitCode).toBe(0);

    const { rows } = await pool.query(`SELECT smtp_password_cifrada FROM clientes WHERE id = $1`, [
      id,
    ]);
    expect(rows[0].smtp_password_cifrada).toBeNull();
  });

  it('AAD ligado: el ciphertext migrado de un cliente no descifra con el id de otro', async () => {
    const idA = randomUUID();
    const idB = randomUUID();
    await insertarCliente(pool, idA, 'aad-a', cifrarV1(oldKeyBuf, 'secreto-aad-a', idA));
    await insertarCliente(pool, idB, 'aad-b', cifrarV1(oldKeyBuf, 'secreto-aad-b', idB));

    await ejecutarRotacion(pool, { oldKeyBuf, newKeyBuf, modo: 'rotar' });

    const { rows } = await pool.query(`SELECT smtp_password_cifrada FROM clientes WHERE id = $1`, [
      idA,
    ]);
    expect(() => descifrarV1(newKeyBuf, rows[0].smtp_password_cifrada, idB)).toThrow();
  });

  it('round-trip fallido vía deps.cifrar: ROLLBACK total, ninguna fila queda en NEW_KEY', async () => {
    const idSano = randomUUID();
    const idCorrupto = randomUUID();
    const payloadSanoOriginal = cifrarV1(oldKeyBuf, 'secreto-sano', idSano);
    const payloadCorruptoOriginal = cifrarV1(oldKeyBuf, 'secreto-corrupto', idCorrupto);
    await insertarCliente(pool, idSano, 'roundtrip-sano', payloadSanoOriginal);
    await insertarCliente(pool, idCorrupto, 'roundtrip-corrupto', payloadCorruptoOriginal);

    const cifrarConFallaParaUnaFila: typeof cifrarV1 = (clave, textoPlano, aad) =>
      aad === idCorrupto ? cifrarV1(otraKeyBuf, textoPlano, aad) : cifrarV1(clave, textoPlano, aad);

    const resultado = await ejecutarRotacion(
      pool,
      { oldKeyBuf, newKeyBuf, modo: 'rotar' },
      { cifrar: cifrarConFallaParaUnaFila },
    );
    expect(resultado).toMatchObject({ exitCode: 3 });

    const { rows } = await pool.query(
      `SELECT id, smtp_password_cifrada FROM clientes WHERE id = ANY($1) ORDER BY id`,
      [[idSano, idCorrupto]],
    );
    const sano = rows.find((r) => r.id === idSano);
    const corrupto = rows.find((r) => r.id === idCorrupto);
    expect(sano.smtp_password_cifrada).toBe(payloadSanoOriginal);
    expect(corrupto.smtp_password_cifrada).toBe(payloadCorruptoOriginal);
  });

  it('--verificar: todas las filas descifran con la clave dada → exit 0, sin escritura', async () => {
    const idA = randomUUID();
    const idB = randomUUID();
    const payloadA = cifrarV1(newKeyBuf, 'secreto-verificar-a', idA);
    const payloadB = cifrarV1(newKeyBuf, 'secreto-verificar-b', idB);
    await insertarCliente(pool, idA, 'verificar-a', payloadA);
    await insertarCliente(pool, idB, 'verificar-b', payloadB);

    const resultado = await ejecutarVerificacion(pool, { verificarKeyBuf: newKeyBuf });
    expect(resultado).toMatchObject({ exitCode: 0 });

    const { rows } = await pool.query(
      `SELECT id, smtp_password_cifrada FROM clientes WHERE id = ANY($1) ORDER BY id`,
      [[idA, idB]],
    );
    expect(rows.find((r) => r.id === idA).smtp_password_cifrada).toBe(payloadA);
    expect(rows.find((r) => r.id === idB).smtp_password_cifrada).toBe(payloadB);
  });

  it('--verificar: al menos una fila no descifra con la clave dada → exit ≠0, sin escritura', async () => {
    const idSano = randomUUID();
    const idIndescifrable = randomUUID();
    const payloadSano = cifrarV1(newKeyBuf, 'secreto-verificar-sano', idSano);
    const payloadIndescifrable = cifrarV1(otraKeyBuf, 'secreto-verificar-ajeno', idIndescifrable);
    await insertarCliente(pool, idSano, 'verificar-sano', payloadSano);
    await insertarCliente(pool, idIndescifrable, 'verificar-indescifrable', payloadIndescifrable);

    const resultado = await ejecutarVerificacion(pool, { verificarKeyBuf: newKeyBuf });
    expect(resultado.exitCode).not.toBe(0);

    const { rows } = await pool.query(
      `SELECT id, smtp_password_cifrada FROM clientes WHERE id = ANY($1) ORDER BY id`,
      [[idSano, idIndescifrable]],
    );
    expect(rows.find((r) => r.id === idSano).smtp_password_cifrada).toBe(payloadSano);
    expect(rows.find((r) => r.id === idIndescifrable).smtp_password_cifrada).toBe(
      payloadIndescifrable,
    );
  });

  describe('destinos TOTP (usuarios_tfa)', () => {
    it('re-cifra SMTP, secreto activo y pendiente; descifran con la clave nueva y AAD propio (K1, K2)', async () => {
      const idCliente = randomUUID();
      const idUsuario = randomUUID();
      await insertarCliente(pool, idCliente, 'tfa-smtp', cifrarV1(oldKeyBuf, 'smtp', idCliente));
      await insertarUsuarioTfa(
        pool,
        idUsuario,
        cifrarV1(oldKeyBuf, 'totp-activo', `tfa:${idUsuario}`),
        cifrarV1(oldKeyBuf, 'totp-pendiente', `tfa:${idUsuario}`),
      );

      const resultado = await ejecutarRotacion(pool, { oldKeyBuf, newKeyBuf, modo: 'rotar' });
      expect(resultado).toMatchObject({ exitCode: 0, migradas: 3, yaMigradas: 0 });

      const tfa = await leerTfa(pool, idUsuario);
      const aad = `tfa:${idUsuario}`;
      expect(descifrarV1(newKeyBuf, tfa.secreto_cifrado as string, aad)).toBe('totp-activo');
      expect(descifrarV1(newKeyBuf, tfa.secreto_pendiente_cifrado as string, aad)).toBe(
        'totp-pendiente',
      );
      expect(() => descifrarV1(oldKeyBuf, tfa.secreto_cifrado as string, aad)).toThrow();
      const { rows } = await pool.query(
        `SELECT smtp_password_cifrada FROM clientes WHERE id = $1`,
        [idCliente],
      );
      expect(descifrarV1(newKeyBuf, rows[0].smtp_password_cifrada, idCliente)).toBe('smtp');
    });

    it('idempotente: la segunda corrida cuenta ya_migradas y no toca nada; columnas NULL se ignoran', async () => {
      const idUsuario = randomUUID();
      const idSoloActivo = randomUUID();
      await insertarUsuarioTfa(
        pool,
        idUsuario,
        cifrarV1(oldKeyBuf, 'a', `tfa:${idUsuario}`),
        cifrarV1(oldKeyBuf, 'p', `tfa:${idUsuario}`),
      );
      await insertarUsuarioTfa(
        pool,
        idSoloActivo,
        cifrarV1(oldKeyBuf, 'b', `tfa:${idSoloActivo}`),
        null,
      );

      const primera = await ejecutarRotacion(pool, { oldKeyBuf, newKeyBuf, modo: 'rotar' });
      expect(primera).toMatchObject({ exitCode: 0, migradas: 3, yaMigradas: 0 });
      const trasPrimera = await leerTfa(pool, idUsuario);

      const segunda = await ejecutarRotacion(pool, { oldKeyBuf, newKeyBuf, modo: 'rotar' });
      expect(segunda).toMatchObject({ exitCode: 0, migradas: 0, yaMigradas: 3 });
      expect(await leerTfa(pool, idUsuario)).toEqual(trasPrimera);
      expect((await leerTfa(pool, idSoloActivo)).secreto_pendiente_cifrado).toBeNull();
    });

    it('un secreto TOTP indescifrable revierte TODO, también el SMTP ya re-cifrado (K2)', async () => {
      const idCliente = randomUUID();
      const idUsuario = randomUUID();
      const smtpOriginal = cifrarV1(oldKeyBuf, 'smtp', idCliente);
      const activoOriginal = cifrarV1(oldKeyBuf, 'a', `tfa:${idUsuario}`);
      const pendienteAjeno = cifrarV1(otraKeyBuf, 'p', `tfa:${idUsuario}`);
      await insertarCliente(pool, idCliente, 'tfa-rollback', smtpOriginal);
      await insertarUsuarioTfa(pool, idUsuario, activoOriginal, pendienteAjeno);

      const resultado = await ejecutarRotacion(pool, { oldKeyBuf, newKeyBuf, modo: 'rotar' });
      expect(resultado).toMatchObject({ exitCode: 3 });

      const tfa = await leerTfa(pool, idUsuario);
      expect(tfa.secreto_cifrado).toBe(activoOriginal);
      expect(tfa.secreto_pendiente_cifrado).toBe(pendienteAjeno);
      const { rows } = await pool.query(
        `SELECT smtp_password_cifrada FROM clientes WHERE id = $1`,
        [idCliente],
      );
      expect(rows[0].smtp_password_cifrada).toBe(smtpOriginal);
    });

    it('un ciphertext TOTP movido a otro usuario no descifra (AAD tfa:{usuario_id})', async () => {
      const idA = randomUUID();
      const idB = randomUUID();
      await insertarUsuarioTfa(pool, idA, cifrarV1(oldKeyBuf, 'a', `tfa:${idB}`), null);

      const resultado = await ejecutarRotacion(pool, { oldKeyBuf, newKeyBuf, modo: 'rotar' });
      expect(resultado).toMatchObject({ exitCode: 3 });
    });

    it('--verificar recorre los destinos TOTP: ok con la clave vigente, falla con un secreto ajeno (K3)', async () => {
      const idUsuario = randomUUID();
      await insertarUsuarioTfa(
        pool,
        idUsuario,
        cifrarV1(newKeyBuf, 'a', `tfa:${idUsuario}`),
        cifrarV1(newKeyBuf, 'p', `tfa:${idUsuario}`),
      );
      expect(await ejecutarVerificacion(pool, { verificarKeyBuf: newKeyBuf })).toMatchObject({
        exitCode: 0,
      });

      const pendienteAjeno = cifrarV1(otraKeyBuf, 'p', `tfa:${idUsuario}`);
      await pool.query(`UPDATE usuarios_tfa SET secreto_pendiente_cifrado = $1`, [pendienteAjeno]);
      const resultado = await ejecutarVerificacion(pool, { verificarKeyBuf: newKeyBuf });
      expect(resultado.exitCode).toBe(3);
      expect((await leerTfa(pool, idUsuario)).secreto_pendiente_cifrado).toBe(pendienteAjeno);
    });
  });
});
