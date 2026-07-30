/**
 * 1.6/1.7 — RED: AesGcmSecretCipher round-trip + authTag tampering (R2).
 *
 * `decrypt()` NUNCA lanza — clave inválida o `authTag` alterado se modelan
 * como `Result.fail(CifradoError code=CONFIG_CIFRADO_INVALIDO)`.
 *
 * Ref design: §5, §6. Ref spec: R2 escenarios 1-2. Ref tasks: PR1 1.6-1.7.
 */
import { Logger } from '@nestjs/common';
import { AesGcmSecretCipher } from './aes-gcm-secret-cipher.adapter';
import { CifradoError } from '../../domain/errors/cifrado.errors';
import { validateConfigEncryptionKey } from './config-encryption-key';

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

    // WARNING (Judgment Day PR1 Ronda 1, confirmado): Buffer.from(raw,'base64')
    // ignora silenciosamente basura no-base64 intercalada — una clave
    // malformada con ≥43 chars base64 válidos decodifica igual a 32 bytes y
    // hoy pasaría el chequeo de solo-longitud sin que nadie lo note.
    it('encrypt() con CONFIG_ENCRYPTION_KEY de formato base64 inválido (aunque decodifique a 32 bytes) retorna Result.fail(CifradoError)', () => {
      const validKey = Buffer.alloc(32, 7).toString('base64');
      const malformedKey = `${validKey.slice(0, 20)}$$$${validKey.slice(20)}`;
      expect(Buffer.from(malformedKey, 'base64').length).toBe(32);

      const cipher = new AesGcmSecretCipher(buildEnv({ CONFIG_ENCRYPTION_KEY: malformedKey }));

      const result = cipher.encrypt('valor');

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(CifradoError);
    });
  });

  describe('R2 escenario 3 — dos encrypt() del mismo plaintext ⇒ IV y ciphertext únicos (invariante GCM)', () => {
    it('encrypt() del mismo plaintext dos veces produce IVs distintos, ciphertexts distintos, e IV de 12 bytes', () => {
      const cipher = new AesGcmSecretCipher(buildEnv());
      const plaintext = 'mismo-plaintext-cifrado-dos-veces';

      const payload1 = cipher.encrypt(plaintext).getValue();
      const payload2 = cipher.encrypt(plaintext).getValue();

      // Nonce reuse en AES-GCM rompe la confidencialidad e integridad del
      // esquema completo — esta es la invariante MÁS crítica a proteger.
      expect(payload1.iv).not.toBe(payload2.iv);
      expect(payload1.valor).not.toBe(payload2.valor);

      expect(Buffer.from(payload1.iv, 'base64').length).toBe(12);
      expect(Buffer.from(payload2.iv, 'base64').length).toBe(12);

      // Ambos deben seguir descifrando correctamente al plaintext original.
      expect(cipher.decrypt(payload1).getValue()).toBe(plaintext);
      expect(cipher.decrypt(payload2).getValue()).toBe(plaintext);
    });
  });

  // Judgment Day PR1 Ronda 2, fix #1 (REGRESIÓN real): el recipe documentado
  // `openssl rand -base64 32 > key.txt` agrega un `\n` final — sin `.trim()`
  // en `loadKey()`, una clave VÁLIDA leída de archivo sería rechazada acá
  // igual que en `validateConfigEncryptionKey()`.
  describe('Judgment Day PR1 Ronda 2 — fix #1: trim() de whitespace de borde en loadKey()', () => {
    it('encrypt()/decrypt() funcionan con una clave válida con "\\n" final', () => {
      const cipher = new AesGcmSecretCipher(
        buildEnv({ CONFIG_ENCRYPTION_KEY: `${Buffer.alloc(32, 9).toString('base64')}\n` }),
      );
      const plaintext = 'clave-con-newline-final';

      const encrypted = cipher.encrypt(plaintext);
      expect(encrypted.isOk()).toBe(true);
      expect(cipher.decrypt(encrypted.getValue()).getValue()).toBe(plaintext);
    });

    it('encrypt() funciona con una clave válida con espacios de borde', () => {
      const cipher = new AesGcmSecretCipher(
        buildEnv({ CONFIG_ENCRYPTION_KEY: `  ${Buffer.alloc(32, 9).toString('base64')}  ` }),
      );

      expect(cipher.encrypt('valor').isOk()).toBe(true);
    });
  });

  // Judgment Day PR1 Ronda 2, fix #2 (confirmado A+B): el mismo input
  // inválido debe dar el MISMO diagnóstico por `validateConfigEncryptionKey()`
  // (boot-time, throw) y por `loadKey()` del adapter (lazy, Result.fail) —
  // ambos delegan al predicado compartido `checkConfigEncryptionKeyFormat()`.
  describe('Judgment Day PR1 Ronda 2 — fix #2: mismo diagnóstico entre validator y adapter', () => {
    it('clave de 16 bytes: validateConfigEncryptionKey() y encrypt() coinciden en "formato" (no "longitud")', () => {
      const clave16 = Buffer.alloc(16, 1).toString('base64');

      expect(() =>
        validateConfigEncryptionKey({ CONFIG_ENCRYPTION_KEY: clave16 } as NodeJS.ProcessEnv),
      ).toThrow(/formato/i);

      const cipher = new AesGcmSecretCipher(buildEnv({ CONFIG_ENCRYPTION_KEY: clave16 }));
      const result = cipher.encrypt('valor');
      expect(result.isFail()).toBe(true);
      expect(result.getError().message).toMatch(/formato/i);
    });

    it('clave de 48 bytes: validateConfigEncryptionKey() y encrypt() coinciden en "formato" (no "longitud")', () => {
      const clave48 = Buffer.alloc(48, 1).toString('base64');

      expect(() =>
        validateConfigEncryptionKey({ CONFIG_ENCRYPTION_KEY: clave48 } as NodeJS.ProcessEnv),
      ).toThrow(/formato/i);

      const cipher = new AesGcmSecretCipher(buildEnv({ CONFIG_ENCRYPTION_KEY: clave48 }));
      const result = cipher.encrypt('valor');
      expect(result.isFail()).toBe(true);
      expect(result.getError().message).toMatch(/formato/i);
    });
  });

  // Fix #3 (LOW): el log de decrypt() en el path de tampering NUNCA debe
  // filtrar el secreto en claro — solo `err.message`/tipo (spec R2).
  describe('Fix #3 — el log de decrypt() en tampering no filtra el plaintext', () => {
    it('Logger.prototype.error loguea err.message pero NUNCA el plaintext original', () => {
      const errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

      try {
        const cipher = new AesGcmSecretCipher(buildEnv());
        const plaintext = 'secreto-que-NUNCA-debe-aparecer-en-el-log-9182';
        const payload = cipher.encrypt(plaintext).getValue();

        const tamperedAuthTag = Buffer.from(payload.authTag, 'base64');
        tamperedAuthTag[0] = tamperedAuthTag[0] ^ 0xff;
        const tampered = { ...payload, authTag: tamperedAuthTag.toString('base64') };

        const result = cipher.decrypt(tampered);
        expect(result.isFail()).toBe(true);

        expect(errorSpy).toHaveBeenCalledTimes(1);
        const [loggedMessage, loggedStack] = errorSpy.mock.calls[0] as [string, string?];

        // NUNCA el plaintext ni el ciphertext/valor del payload.
        expect(loggedMessage).not.toContain(plaintext);
        expect(loggedMessage).not.toContain(payload.valor);
        if (loggedStack) {
          expect(loggedStack).not.toContain(plaintext);
        }

        // SÍ debe contener err.message: el código loguea
        // `decrypt() falló: ${raw.constructor.name}: ${raw.message}` — el
        // texto exacto de err.message lo define node:crypto/OpenSSL y no se
        // hardcodea acá; se verifica que el prefijo esperado esté presente y
        // que haya contenido real después de él (err.message no vacío).
        expect(loggedMessage).toMatch(/^decrypt\(\) falló: /);
        const errMessagePart = loggedMessage.replace(/^decrypt\(\) falló: [^:]+: /, '');
        expect(errMessagePart.length).toBeGreaterThan(0);
      } finally {
        errorSpy.mockRestore();
      }
    });
  });
});
