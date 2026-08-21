// Backfill (one-off): siembra la config SMTP GLOBAL actual (env `SMTP_*`)
// en los clientes que ya existen y todavía no tienen config propia.
//
// Ref proposal/decisión: sdd/configuracion-correo-por-cliente, decisión #1
// (backfill, no migración silenciosa) — al desplegar, un cliente sin config
// deja de recibir notificaciones; los clientes que ya existen en producción
// no eligieron eso. El backfill vuelve EXPLÍCITO lo que hoy pasa de forma
// implícita (queda visible en la ficha del cliente y editable) sin cortar
// el correo ni un minuto.
// Ref design: sdd/configuracion-correo-por-cliente D5.
//
// Idempotente POR CONSTRUCCIÓN (restricción dura del orquestador, WU6): el
// UPDATE re-evalúa `smtp_password_cifrada IS NULL` en la propia sentencia,
// no solo en el SELECT previo — una config que ROOT ya cargó a mano (en esta
// corrida o entre el SELECT y el UPDATE) nunca se pisa. Correrlo dos veces
// no cambia nada.
//
// El CHECK de la base (`clientes_smtp_config_todo_o_nada_check`, D4) exige
// host/port/user/from/password juntos o ninguno — por eso este script
// aborta si falta CUALQUIERA de las env vars `SMTP_*` requeridas: nunca
// puede escribir una config parcial.
//
// El script NO puede importar `src/` sin build, así que DUPLICA ~15 líneas
// del cifrado de `AesGcmSecretCipher` (mismo formato `v1:{iv}:{tag}:{ct}`,
// AES-256-GCM, AAD = clienteId — ver WU1, D1). Esta duplicación es la razón
// de ser de `backfill-correo-clientes.spec.ts`: dos implementaciones del
// mismo cifrado que divergen en silencio dejan una credencial irrecuperable
// que nadie nota hasta que un mail no sale.
//
// Precedente de forma: `scripts/backfill-modulos-5.2.mjs` (carga de env,
// manejo de errores, salida) y `scripts/drop-legacy-rbac-matriz-vieja.mjs`
// (`process.loadEnvFile` tolerante a `.env` ausente).
import * as crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import pg from 'pg';

// ── Cifrado (duplicado deliberado de AesGcmSecretCipher — ver cabecera) ──

const KEY_VERSION = 'v1';
const IV_LENGTH_BYTES = 12;
const KEY_LENGTH_HEX_CHARS = 64;

/** Valida y decodifica la clave maestra. `null` si falta o está malformada. */
export function leerClaveCifrado(rawKey) {
  if (!rawKey || rawKey.length !== KEY_LENGTH_HEX_CHARS || !/^[0-9a-fA-F]+$/.test(rawKey)) {
    return null;
  }
  return Buffer.from(rawKey, 'hex');
}

/** Cifra `plaintext` con AAD = `aad` (clienteId). Mismo formato que WU1. */
export function cifrarSecretoBackfill(plaintext, aad, keyHex) {
  const key = leerClaveCifrado(keyHex);
  if (!key) {
    throw new Error('EMAIL_CRYPTO_KEY ausente o inválida — no se puede cifrar el secreto');
  }

  const iv = crypto.randomBytes(IV_LENGTH_BYTES);
  const encipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  encipher.setAAD(Buffer.from(aad, 'utf8'));

  const ciphertext = Buffer.concat([encipher.update(plaintext, 'utf8'), encipher.final()]);
  const tag = encipher.getAuthTag();

  return [
    KEY_VERSION,
    iv.toString('base64'),
    tag.toString('base64'),
    ciphertext.toString('base64'),
  ].join(':');
}

/**
 * Descifra un payload `v1:{iv}:{tag}:{ct}`. No la usa `main()` — existe para
 * que el test de descifrado cruzado pruebe las DOS direcciones: lo que
 * cifra `AesGcmSecretCipher` también lo tiene que poder descifrar el script.
 */
export function descifrarSecretoBackfill(payload, aad, keyHex) {
  const key = leerClaveCifrado(keyHex);
  if (!key) {
    throw new Error('EMAIL_CRYPTO_KEY ausente o inválida — no se puede descifrar el secreto');
  }

  const segments = payload.split(':');
  if (segments.length !== 4) {
    throw new Error('Payload cifrado con formato inválido');
  }

  const [version, ivB64, tagB64, ciphertextB64] = segments;
  if (version !== KEY_VERSION) {
    throw new Error(`Versión de clave desconocida: ${version}`);
  }

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAAD(Buffer.from(aad, 'utf8'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, 'base64')),
    decipher.final(),
  ]);

  return plaintext.toString('utf8');
}

// ── Config desde env ──

const SMTP_REQUERIDAS = [
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASSWORD',
  'SMTP_FROM',
  'SMTP_SECURE',
];

/**
 * Lee y valida la config SMTP global + `EMAIL_CRYPTO_KEY` desde `env`.
 * Aborta (throw) si falta cualquiera de las variables requeridas — el CHECK
 * de la base exige todo-o-nada, así que este script nunca puede escribir
 * una config parcial.
 */
export function leerConfigDesdeEnv(env) {
  const faltantes = SMTP_REQUERIDAS.filter((clave) => !env[clave]);
  if (!env.EMAIL_CRYPTO_KEY) {
    faltantes.push('EMAIL_CRYPTO_KEY');
  }

  if (faltantes.length > 0) {
    throw new Error(
      `Faltan variables de entorno requeridas para el backfill: ${faltantes.join(', ')}. ` +
        'El CHECK de la base exige una config todo-o-nada — no se puede escribir una config parcial.',
    );
  }

  const puerto = Number(env.SMTP_PORT);
  if (!Number.isInteger(puerto) || puerto <= 0) {
    throw new Error(`SMTP_PORT inválido: "${env.SMTP_PORT}" no es un puerto numérico válido`);
  }

  if (leerClaveCifrado(env.EMAIL_CRYPTO_KEY) === null) {
    throw new Error(
      'EMAIL_CRYPTO_KEY presente pero inválida (se esperan 64 caracteres hexadecimales)',
    );
  }

  return {
    smtpHost: env.SMTP_HOST,
    smtpPort: puerto,
    smtpUser: env.SMTP_USER,
    smtpPassword: env.SMTP_PASSWORD,
    smtpFrom: env.SMTP_FROM,
    smtpSecure: env.SMTP_SECURE === 'true',
    emailCryptoKey: env.EMAIL_CRYPTO_KEY,
  };
}

// ── Backfill ──

/**
 * Ejecuta el backfill contra `pool` con `config` ya validada (`leerConfigDesdeEnv`).
 * Recibe el pool por parámetro (en vez de abrirlo acá) para que el test de
 * idempotencia pueda correrlo contra una DB efímera sin tocar `soporte_master`.
 */
export async function ejecutarBackfill(pool, config) {
  const { rows } = await pool.query(
    `SELECT id FROM clientes WHERE deleted_at IS NULL AND smtp_password_cifrada IS NULL ORDER BY id`,
  );

  let actualizados = 0;
  for (const { id } of rows) {
    const passwordCifrada = cifrarSecretoBackfill(config.smtpPassword, id, config.emailCryptoKey);

    // El WHERE se re-evalúa acá, no solo en el SELECT de arriba — es lo que
    // hace la idempotencia real y lo que evita pisar una config manual.
    const resultado = await pool.query(
      `UPDATE clientes
          SET smtp_host = $1,
              smtp_port = $2,
              smtp_user = $3,
              smtp_secure = $4,
              smtp_from = $5,
              smtp_password_cifrada = $6,
              smtp_config_updated_at = now()
        WHERE id = $7 AND smtp_password_cifrada IS NULL`,
      [
        config.smtpHost,
        config.smtpPort,
        config.smtpUser,
        config.smtpSecure,
        config.smtpFrom,
        passwordCifrada,
        id,
      ],
    );
    actualizados += resultado.rowCount ?? 0;
  }

  const totales = await pool.query(
    `SELECT count(*) FILTER (WHERE smtp_password_cifrada IS NOT NULL)::int AS configurados,
            count(*) FILTER (WHERE smtp_password_cifrada IS NULL)::int AS sin_config
       FROM clientes WHERE deleted_at IS NULL`,
  );

  return { actualizados, ...totales.rows[0] };
}

// ── Entry point ──

async function main() {
  try {
    process.loadEnvFile('.env');
  } catch {
    // .env ausente: se usan las variables ya presentes en el entorno.
  }

  const connectionString = process.env.DATABASE_URL_MASTER;
  if (!connectionString) {
    console.error('[backfill-correo] falta DATABASE_URL_MASTER');
    process.exit(1);
    return;
  }

  let config;
  try {
    config = leerConfigDesdeEnv(process.env);
  } catch (e) {
    console.error('[backfill-correo] ' + e.message);
    process.exit(1);
    return;
  }

  const pool = new pg.Pool({ connectionString });
  try {
    const resultado = await ejecutarBackfill(pool, config);
    console.log('[backfill-correo] Clientes actualizados esta corrida:', resultado.actualizados);
    console.log('[backfill-correo] Total clientes con config:', resultado.configurados);
    console.log('[backfill-correo] Total clientes sin config:', resultado.sin_config);
  } catch (e) {
    console.error('[backfill-correo] Error en el backfill:', e.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Solo corre el backfill real si el archivo se invoca directamente — así el
// test de descifrado cruzado y el de idempotencia pueden importar las
// funciones de este módulo sin conectarse a ninguna base.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
