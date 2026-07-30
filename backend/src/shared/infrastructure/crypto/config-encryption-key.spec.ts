/**
 * 1.9 — RED: validateConfigEncryptionKey() lanza al bootstrap si
 * `CONFIG_ENCRYPTION_KEY` falta o tiene longitud inválida para AES-256 (F1).
 *
 * Mismo patrón que `email-config.spec.ts` (SmtpConfigError): función pura,
 * unit-testeada sin bootstrapear Nest. El test de bootstrap real (Nest
 * `Test.createTestingModule`) vive en `shared.module.spec.ts`.
 *
 * Ref design: §14 F1 (resolución autoritativa "Resolución de forks — F1").
 * Ref tasks: PR1 1.9-1.10.
 */
import { validateConfigEncryptionKey, ConfigEncryptionKeyError } from './config-encryption-key';

describe('validateConfigEncryptionKey()', () => {
  it('no lanza si CONFIG_ENCRYPTION_KEY es base64 válido de 32 bytes', () => {
    const env = {
      CONFIG_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
    } as NodeJS.ProcessEnv;

    expect(() => validateConfigEncryptionKey(env)).not.toThrow();
  });

  it('lanza ConfigEncryptionKeyError si CONFIG_ENCRYPTION_KEY está ausente', () => {
    const env = {} as NodeJS.ProcessEnv;

    expect(() => validateConfigEncryptionKey(env)).toThrow(ConfigEncryptionKeyError);
    expect(() => validateConfigEncryptionKey(env)).toThrow(/CONFIG_ENCRYPTION_KEY/);
  });

  it('lanza ConfigEncryptionKeyError si la clave decodifica a menos de 32 bytes', () => {
    const env = {
      CONFIG_ENCRYPTION_KEY: Buffer.alloc(16, 1).toString('base64'),
    } as NodeJS.ProcessEnv;

    expect(() => validateConfigEncryptionKey(env)).toThrow(ConfigEncryptionKeyError);
    expect(() => validateConfigEncryptionKey(env)).toThrow(/longitud/i);
  });

  it('lanza ConfigEncryptionKeyError si la clave decodifica a más de 32 bytes', () => {
    const env = {
      CONFIG_ENCRYPTION_KEY: Buffer.alloc(48, 1).toString('base64'),
    } as NodeJS.ProcessEnv;

    expect(() => validateConfigEncryptionKey(env)).toThrow(ConfigEncryptionKeyError);
  });

  it('el mensaje de error NUNCA interpola el valor de la clave (aunque sea inválida)', () => {
    const secretLookingValue = 'ESTO-NO-DEBE-APARECER-EN-EL-MENSAJE';
    const env = { CONFIG_ENCRYPTION_KEY: secretLookingValue } as NodeJS.ProcessEnv;

    try {
      validateConfigEncryptionKey(env);
      throw new Error('debía lanzar');
    } catch (err) {
      expect((err as Error).message).not.toContain(secretLookingValue);
    }
  });
});
