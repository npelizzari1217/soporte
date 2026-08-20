/**
 * aes-gcm-secret-cipher.spec.ts — TDD RED phase (WU1, sdd/configuracion-correo-por-cliente).
 *
 * Ref design: D1 (formato `v1:{iv}:{tag}:{ct}`, AAD = clienteId), D2
 * (EMAIL_CRYPTO_KEY leída por llamada, sin fail-fast al boot).
 * Ref tasks: WU1 1.3.
 */
import { AesGcmSecretCipher } from './aes-gcm-secret-cipher';

const VALID_KEY_HEX = 'a'.repeat(64); // 32 bytes válidos (64 hex chars)

describe('AesGcmSecretCipher', () => {
  const originalEnv = process.env.EMAIL_CRYPTO_KEY;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.EMAIL_CRYPTO_KEY;
    } else {
      process.env.EMAIL_CRYPTO_KEY = originalEnv;
    }
  });

  describe('con clave válida', () => {
    beforeEach(() => {
      process.env.EMAIL_CRYPTO_KEY = VALID_KEY_HEX;
    });

    it('cifra y descifra ida y vuelta con el mismo aad', () => {
      const cipher = new AesGcmSecretCipher();
      const plaintext = 'super-secreto-smtp';

      const payload = cipher.encrypt(plaintext, 'cliente-1');

      expect(cipher.decrypt(payload, 'cliente-1')).toBe(plaintext);
    });

    it('persiste el payload con el prefijo de versión v1 y 4 segmentos', () => {
      const cipher = new AesGcmSecretCipher();

      const payload = cipher.encrypt('valor', 'cliente-1');
      const segments = payload.split(':');

      expect(payload.startsWith('v1:')).toBe(true);
      expect(segments).toHaveLength(4);
      expect(segments[0]).toBe('v1');
    });

    it('rechaza el descifrado si el ciphertext o el tag fueron manipulados', () => {
      const cipher = new AesGcmSecretCipher();
      const payload = cipher.encrypt('valor-original', 'cliente-1');
      const [version, iv, tag, ct] = payload.split(':');

      // Manipulamos el último byte del ciphertext en base64 — invalida el tag GCM.
      const tamperedCt = ct.slice(0, -2) + (ct.slice(-2) === 'AA' ? 'BB' : 'AA');
      const tampered = [version, iv, tag, tamperedCt].join(':');

      expect(() => cipher.decrypt(tampered, 'cliente-1')).toThrow();
    });

    it('rechaza el descifrado si el aad no coincide con el usado al cifrar (anti-suplantación)', () => {
      const cipher = new AesGcmSecretCipher();
      const payload = cipher.encrypt('valor-original', 'cliente-1');

      expect(() => cipher.decrypt(payload, 'cliente-2')).toThrow();
    });

    it('rechaza un payload con versión de clave desconocida', () => {
      const cipher = new AesGcmSecretCipher();
      const payload = cipher.encrypt('valor', 'cliente-1');
      const withoutVersion = payload.slice(payload.indexOf(':') + 1);
      const badVersion = `v9:${withoutVersion}`;

      expect(() => cipher.decrypt(badVersion, 'cliente-1')).toThrow();
    });

    it('isAvailable() es true con clave válida presente', () => {
      const cipher = new AesGcmSecretCipher();

      expect(cipher.isAvailable()).toBe(true);
    });
  });

  describe('sin clave o con clave malformada', () => {
    it('isAvailable() es false si EMAIL_CRYPTO_KEY no está seteada', () => {
      delete process.env.EMAIL_CRYPTO_KEY;
      const cipher = new AesGcmSecretCipher();

      expect(cipher.isAvailable()).toBe(false);
    });

    it('isAvailable() es false si EMAIL_CRYPTO_KEY no tiene 64 chars hex', () => {
      process.env.EMAIL_CRYPTO_KEY = 'no-es-hex-valido';
      const cipher = new AesGcmSecretCipher();

      expect(cipher.isAvailable()).toBe(false);
    });

    it('encrypt() lanza si falta la clave (nunca guarda un secreto sin proteger)', () => {
      delete process.env.EMAIL_CRYPTO_KEY;
      const cipher = new AesGcmSecretCipher();

      expect(() => cipher.encrypt('valor', 'cliente-1')).toThrow();
    });
  });
});
