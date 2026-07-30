/**
 * 1.6/1.7 — RED: AesGcmSecretCipher round-trip + authTag tampering (R2).
 *
 * `decrypt()` NUNCA lanza — clave inválida o `authTag` alterado se modelan
 * como `Result.fail(CifradoError code=CONFIG_CIFRADO_INVALIDO)`.
 *
 * Ref design: §5, §6. Ref spec: R2 escenarios 1-2. Ref tasks: PR1 1.6-1.7.
 */
import { AesGcmSecretCipher } from './aes-gcm-secret-cipher.adapter';
import { CifradoError } from '../../domain/errors/cifrado.errors';

function buildEnv(overrides: Partial<NodeJS.ProcessEnv> = {}): NodeJS.ProcessEnv {
  return {
    CONFIG_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64'),
    ...overrides,
  } as NodeJS.ProcessEnv;
}

describe('AesGcmSecretCipher', () => {
  describe('R2 escenario 1 — round-trip encrypt → decrypt', () => {
    it('decrypt(encrypt(plaintext)) devuelve el plaintext original', () => {
      const cipher = new AesGcmSecretCipher(buildEnv());
      const plaintext = 'smtp-password-123';

      const encrypted = cipher.encrypt(plaintext);
      expect(encrypted.isOk()).toBe(true);

      const payload = encrypted.getValue();
      const decrypted = cipher.decrypt(payload);

      expect(decrypted.isOk()).toBe(true);
      expect(decrypted.getValue()).toBe(plaintext);
    });

    it('el ciphertext resultante nunca contiene el plaintext en claro', () => {
      const cipher = new AesGcmSecretCipher(buildEnv());
      const plaintext = 'super-secreto-unico-9182';

      const payload = cipher.encrypt(plaintext).getValue();

      expect(payload.valor).not.toContain(plaintext);
      expect(JSON.stringify(payload)).not.toContain(plaintext);
    });
  });

  describe('R2 escenario 2 — authTag alterado (tampering) ⇒ Result.fail, nunca throw', () => {
    it('decrypt() con authTag alterado retorna Result.fail(CifradoError code=CONFIG_CIFRADO_INVALIDO)', () => {
      const cipher = new AesGcmSecretCipher(buildEnv());
      const payload = cipher.encrypt('valor-original').getValue();

      const tamperedAuthTag = Buffer.from(payload.authTag, 'base64');
      tamperedAuthTag[0] = tamperedAuthTag[0] ^ 0xff; // flip un byte
      const tampered = { ...payload, authTag: tamperedAuthTag.toString('base64') };

      let result;
      expect(() => {
        result = cipher.decrypt(tampered);
      }).not.toThrow();

      expect(result!.isFail()).toBe(true);
      expect(result!.getError()).toBeInstanceOf(CifradoError);
      expect(result!.getError().code).toBe('CONFIG_CIFRADO_INVALIDO');
    });
  });

  describe('clave ausente/inválida en el momento del cifrado ⇒ Result.fail, nunca throw', () => {
    it('encrypt() sin CONFIG_ENCRYPTION_KEY retorna Result.fail(CifradoError)', () => {
      const cipher = new AesGcmSecretCipher({} as NodeJS.ProcessEnv);

      const result = cipher.encrypt('valor');

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(CifradoError);
    });

    it('decrypt() sin CONFIG_ENCRYPTION_KEY retorna Result.fail(CifradoError), nunca throw', () => {
      const cipherConClave = new AesGcmSecretCipher(buildEnv());
      const payload = cipherConClave.encrypt('valor').getValue();

      const cipherSinClave = new AesGcmSecretCipher({} as NodeJS.ProcessEnv);

      let result;
      expect(() => {
        result = cipherSinClave.decrypt(payload);
      }).not.toThrow();
      expect(result!.isFail()).toBe(true);
      expect(result!.getError()).toBeInstanceOf(CifradoError);
    });
  });
});
