import * as crypto from 'crypto';
import { ISecretCipher } from '../../domain/ports/i-secret-cipher.port';

/** Versión de clave soportada — prefijo del payload persistido (D1). */
const KEY_VERSION = 'v1';

/** IV de 12 bytes (96 bits) — tamaño recomendado por AES-GCM. */
const IV_LENGTH_BYTES = 12;

/** Clave maestra de 32 bytes (AES-256) = 64 caracteres hexadecimales. */
const KEY_LENGTH_HEX_CHARS = 64;

/**
 * AesGcmSecretCipher — adaptador de ISecretCipher sobre AES-256-GCM con el
 * módulo `crypto` nativo de Node (sin librerías nuevas).
 *
 * Persiste un único string autodescriptivo: `v1:{iv_b64}:{tag_b64}:{ct_b64}`.
 * La versión de clave viaja como PREFIJO del string, no como columna
 * hermana — un `UPDATE` parcial no puede desincronizar version/iv/tag/ct
 * porque son un solo valor atómico.
 *
 * La clave maestra se lee de `EMAIL_CRYPTO_KEY` en CADA llamada (no en el
 * constructor ni al boot): este repo no tiene precedente de fail-fast por
 * env faltante (`auth.module.ts:94` cae a un default de dev), así que la
 * app arranca igual sin la clave. Quien la necesite (`encrypt`) y no la
 * tenga, falla en el momento del uso — nunca guarda un secreto sin cifrar.
 *
 * Ref design: sdd/configuracion-correo-por-cliente D1, D2.
 */
export class AesGcmSecretCipher implements ISecretCipher {
  /**
   * Lee y valida la clave maestra desde `process.env.EMAIL_CRYPTO_KEY`.
   * Devuelve `null` si falta o está malformada (no es hex de 64 chars) —
   * nunca trunca ni derivada una clave débil a partir de un valor inválido.
   */
  private readKey(): Buffer | null {
    const raw = process.env.EMAIL_CRYPTO_KEY;

    if (!raw || raw.length !== KEY_LENGTH_HEX_CHARS || !/^[0-9a-fA-F]+$/.test(raw)) {
      return null;
    }

    return Buffer.from(raw, 'hex');
  }

  isAvailable(): boolean {
    return this.readKey() !== null;
  }

  encrypt(plaintext: string, aad: string): string {
    const key = this.readKey();

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

  decrypt(payload: string, aad: string): string {
    const key = this.readKey();

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

    // Un aad equivocado o un ciphertext/tag manipulado hace fallar `final()`
    // (verificación de integridad GCM) — es la garantía anti-suplantación.
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertextB64, 'base64')),
      decipher.final(),
    ]);

    return plaintext.toString('utf8');
  }
}
