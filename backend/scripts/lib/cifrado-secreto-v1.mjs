// Cifrado v1 puro (sin I/O) — espejo de `AesGcmSecretCipher` para uso desde
// `scripts/`, que no puede importar `src/` sin build (ver
// `backfill-correo-clientes.mjs:23-28`).
//
// Ref spec: sdd/rotacion-email-crypto-key, "Compatibilidad de cifrado
// cruzado con AesGcmSecretCipher". Ref design: WU1, ADR-5.
//
// A diferencia de `backfill-correo-clientes.mjs` (que lee la clave desde una
// env var en cada llamada), este módulo recibe la clave ya decodificada como
// `Buffer` — la validación de formato ocurre UNA sola vez, en el borde del
// CLI de `rotar-email-crypto-key.mjs` (`validarClaves`), no acá.
//
// PURO por construcción: ninguna función toca `process.env` ni el
// filesystem. El test de descifrado cruzado (`cifrado-secreto-v1.spec.ts`)
// es lo que ata este módulo a `AesGcmSecretCipher` — si divergen en
// silencio, una fila re-cifrada por el script de rotación queda
// indescifrable para el resto de la aplicación.
import * as crypto from 'node:crypto';

/** Versión de clave soportada — prefijo del payload persistido, igual que `AesGcmSecretCipher`. */
const KEY_VERSION = 'v1';

/** IV de 12 bytes (96 bits) — tamaño recomendado por AES-GCM. */
const IV_LENGTH_BYTES = 12;

/** Clave maestra de 32 bytes (AES-256) = 64 caracteres hexadecimales. */
const KEY_LENGTH_HEX_CHARS = 64;

/**
 * Decodifica una clave hexadecimal de 64 caracteres a `Buffer`. Devuelve
 * `null` si `hex` no tiene el formato esperado — nunca trunca ni deriva una
 * clave débil a partir de un valor inválido (mismo contrato que
 * `AesGcmSecretCipher.readKey`).
 * @param {unknown} hex
 * @returns {Buffer | null}
 */
export function leerClaveHex(hex) {
  if (
    typeof hex !== 'string' ||
    hex.length !== KEY_LENGTH_HEX_CHARS ||
    !/^[0-9a-fA-F]+$/.test(hex)
  ) {
    return null;
  }
  return Buffer.from(hex, 'hex');
}

/**
 * Cifra `textoPlano` con `claveBuffer` (32 bytes) y AAD = `aad` (el
 * `clienteId` de la fila). Devuelve el mismo formato autodescriptivo que
 * `AesGcmSecretCipher.encrypt`: `v1:{iv_b64}:{tag_b64}:{ct_b64}`.
 * @param {Buffer} claveBuffer
 * @param {string} textoPlano
 * @param {string} aad
 * @returns {string}
 */
export function cifrarV1(claveBuffer, textoPlano, aad) {
  const iv = crypto.randomBytes(IV_LENGTH_BYTES);
  const encipher = crypto.createCipheriv('aes-256-gcm', claveBuffer, iv);
  encipher.setAAD(Buffer.from(aad, 'utf8'));

  const ciphertext = Buffer.concat([encipher.update(textoPlano, 'utf8'), encipher.final()]);
  const tag = encipher.getAuthTag();

  return [
    KEY_VERSION,
    iv.toString('base64'),
    tag.toString('base64'),
    ciphertext.toString('base64'),
  ].join(':');
}

/**
 * Descifra un `payload` `v1:{iv}:{tag}:{ct}` con `claveBuffer` y AAD = `aad`.
 * Lanza si el formato es inválido (≠ 4 segmentos, prefijo ≠ `v1`), si la
 * clave no coincide o si el AAD no coincide — la verificación de integridad
 * de GCM (`final()`) es la garantía anti-suplantación, igual que en
 * `AesGcmSecretCipher.decrypt`.
 * @param {Buffer} claveBuffer
 * @param {string} payload
 * @param {string} aad
 * @returns {string}
 */
export function descifrarV1(claveBuffer, payload, aad) {
  const segments = String(payload).split(':');

  if (segments.length !== 4) {
    throw new Error('Payload cifrado con formato inválido');
  }

  const [version, ivB64, tagB64, ciphertextB64] = segments;

  if (version !== KEY_VERSION) {
    throw new Error(`Versión de clave desconocida: ${version}`);
  }

  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    claveBuffer,
    Buffer.from(ivB64, 'base64'),
  );
  decipher.setAAD(Buffer.from(aad, 'utf8'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, 'base64')),
    decipher.final(),
  ]);

  return plaintext.toString('utf8');
}
