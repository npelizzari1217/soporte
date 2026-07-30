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
import {
  validateConfigEncryptionKey,
  checkConfigEncryptionKeyFormat,
  ConfigEncryptionKeyError,
} from './config-encryption-key';

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

  // NOTA (Judgment Day PR1 Ronda 2, fix #2 — orden fijo formato→longitud):
  // una clave de 16 bytes en base64 (24 caracteres) NO matchea
  // STRICT_BASE64_32_BYTES (que ancla el string a 44 caracteres exactos), así
  // que con el predicado compartido `checkConfigEncryptionKeyFormat()` esto
  // se diagnostica como 'formato' (no 'longitud') — el branch 'longitud'
  // queda como defensa adicional, inalcanzable mientras el regex ancle el
  // largo. Antes de este fix, `validateConfigEncryptionKey()` chequeaba
  // longitud ANTES que formato y este mismo input daba /longitud/i.
  it('lanza ConfigEncryptionKeyError si la clave decodifica a menos de 32 bytes (diagnosticado como formato, orden fijo)', () => {
    const env = {
      CONFIG_ENCRYPTION_KEY: Buffer.alloc(16, 1).toString('base64'),
    } as NodeJS.ProcessEnv;

    expect(() => validateConfigEncryptionKey(env)).toThrow(ConfigEncryptionKeyError);
    expect(() => validateConfigEncryptionKey(env)).toThrow(/formato/i);
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

  // Judgment Day PR1 Ronda 2, fix #1 (REGRESIÓN real): el recipe documentado
  // `openssl rand -base64 32 > key.txt` agrega un `\n` final. Sin `.trim()`
  // sobre el valor crudo, una clave VÁLIDA leída de archivo (ej. K8s
  // secretKeyRef) sería rechazada al bootstrap — boot failure evitable.
  describe('Judgment Day PR1 Ronda 2 — fix #1: trim() de whitespace de borde', () => {
    it('acepta una clave válida con un "\\n" final (formato del recipe openssl > archivo)', () => {
      const env = {
        CONFIG_ENCRYPTION_KEY: `${Buffer.alloc(32, 3).toString('base64')}\n`,
      } as NodeJS.ProcessEnv;

      expect(() => validateConfigEncryptionKey(env)).not.toThrow();
    });

    it('acepta una clave válida con espacios de borde (leading y trailing)', () => {
      const env = {
        CONFIG_ENCRYPTION_KEY: `  ${Buffer.alloc(32, 3).toString('base64')}  `,
      } as NodeJS.ProcessEnv;

      expect(() => validateConfigEncryptionKey(env)).not.toThrow();
    });

    it('sigue rechazando una clave con basura intercalada en el medio (no es whitespace de borde)', () => {
      const validKey = Buffer.alloc(32, 3).toString('base64');
      const withInternalGarbage = `${validKey.slice(0, 20)} ${validKey.slice(20)}`;
      const env = { CONFIG_ENCRYPTION_KEY: withInternalGarbage } as NodeJS.ProcessEnv;

      expect(() => validateConfigEncryptionKey(env)).toThrow(ConfigEncryptionKeyError);
    });
  });

  // Judgment Day PR1 Ronda 2, fix #2 (confirmado A+B): predicado compartido
  // `checkConfigEncryptionKeyFormat()` — mismo input inválido DEBE dar el
  // mismo diagnóstico sin importar qué camino lo valide.
  describe('Judgment Day PR1 Ronda 2 — fix #2: predicado compartido, mismo diagnóstico', () => {
    it('checkConfigEncryptionKeyFormat() da reason="formato" para una clave de 16 bytes (demasiado corta)', () => {
      const raw = Buffer.alloc(16, 1).toString('base64');
      const result = checkConfigEncryptionKeyFormat(raw);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('formato');
      }
    });

    it('checkConfigEncryptionKeyFormat() da reason="formato" para una clave de 48 bytes (demasiado larga)', () => {
      const raw = Buffer.alloc(48, 1).toString('base64');
      const result = checkConfigEncryptionKeyFormat(raw);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('formato');
      }
    });

    it('16 bytes y 48 bytes dan el MISMO reason (mismo diagnóstico) por el predicado compartido', () => {
      const cortaResult = checkConfigEncryptionKeyFormat(Buffer.alloc(16, 1).toString('base64'));
      const largaResult = checkConfigEncryptionKeyFormat(Buffer.alloc(48, 1).toString('base64'));

      expect(cortaResult.ok).toBe(false);
      expect(largaResult.ok).toBe(false);
      if (!cortaResult.ok && !largaResult.ok) {
        expect(cortaResult.reason).toBe(largaResult.reason);
      }
    });

    it('validateConfigEncryptionKey() da el mismo diagnóstico (/formato/i) para 16 y 48 bytes', () => {
      const envCorta = {
        CONFIG_ENCRYPTION_KEY: Buffer.alloc(16, 1).toString('base64'),
      } as NodeJS.ProcessEnv;
      const envLarga = {
        CONFIG_ENCRYPTION_KEY: Buffer.alloc(48, 1).toString('base64'),
      } as NodeJS.ProcessEnv;

      expect(() => validateConfigEncryptionKey(envCorta)).toThrow(/formato/i);
      expect(() => validateConfigEncryptionKey(envLarga)).toThrow(/formato/i);
    });
  });
});
