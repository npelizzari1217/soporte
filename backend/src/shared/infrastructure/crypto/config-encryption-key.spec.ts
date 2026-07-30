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

  // WARNING (Judgment Day PR1 Ronda 1, confirmado): Buffer.from(raw,'base64')
  // IGNORA silenciosamente caracteres inválidos en vez de rechazarlos. Una
  // clave malformada (con basura no-base64 intercalada) puede seguir
  // decodificando a exactamente 32 bytes si tiene ≥43 caracteres base64
  // válidos — y hoy pasaría la validación sin que nadie lo note.
  it('lanza ConfigEncryptionKeyError si la clave tiene formato base64 inválido aunque decodifique a 32 bytes', () => {
    const validKey = Buffer.alloc(32, 7).toString('base64');
    // Inserta basura no-base64 en el medio. Node ignora "$$$" al decodificar
    // vía Buffer.from(_, 'base64'), así que el largo decodificado sigue
    // siendo 32 bytes — la validación de SOLO longitud (bug real) no detecta
    // esto. Confirmado (pre-fix): Buffer.from(malformed,'base64').length === 32.
    const malformedKey = `${validKey.slice(0, 20)}$$$${validKey.slice(20)}`;
    expect(Buffer.from(malformedKey, 'base64').length).toBe(32);

    const env = { CONFIG_ENCRYPTION_KEY: malformedKey } as NodeJS.ProcessEnv;

    expect(() => validateConfigEncryptionKey(env)).toThrow(ConfigEncryptionKeyError);
    expect(() => validateConfigEncryptionKey(env)).toThrow(/formato/i);
  });

  it('el mensaje de error de formato inválido NUNCA interpola el valor de la clave', () => {
    const validKey = Buffer.alloc(32, 7).toString('base64');
    const malformedKey = `${validKey.slice(0, 20)}$$$${validKey.slice(20)}`;
    const env = { CONFIG_ENCRYPTION_KEY: malformedKey } as NodeJS.ProcessEnv;

    try {
      validateConfigEncryptionKey(env);
      throw new Error('debía lanzar');
    } catch (err) {
      expect((err as Error).message).not.toContain(malformedKey);
    }
  });
});
