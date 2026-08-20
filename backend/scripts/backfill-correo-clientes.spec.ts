/**
 * backfill-correo-clientes.spec.ts — WU6 (sdd/configuracion-correo-por-cliente).
 *
 * El script no puede importar `src/` sin build, así que duplica ~15 líneas
 * del cifrado de `AesGcmSecretCipher` (restricción dura del orquestador).
 * Este es el test que justifica el work unit: si el script y el cifrado de
 * producción divergen en silencio, una contraseña queda cifrada de un lado
 * e indescifrable del otro, y nadie lo nota hasta que un correo no sale.
 *
 * Ref design: D1, D5. Ref tasks: WU6 6.2.
 */
import { AesGcmSecretCipher } from '../src/shared/infrastructure/crypto/aes-gcm-secret-cipher';
import {
  cifrarSecretoBackfill,
  descifrarSecretoBackfill,
  leerConfigDesdeEnv,
} from './backfill-correo-clientes.mjs';

const VALID_KEY_HEX = 'b'.repeat(64);

describe('backfill-correo-clientes — descifrado cruzado con AesGcmSecretCipher', () => {
  const originalEnv = process.env.EMAIL_CRYPTO_KEY;

  beforeEach(() => {
    process.env.EMAIL_CRYPTO_KEY = VALID_KEY_HEX;
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.EMAIL_CRYPTO_KEY;
    } else {
      process.env.EMAIL_CRYPTO_KEY = originalEnv;
    }
  });

  it('lo que cifra el script lo descifra AesGcmSecretCipher (mismo AAD)', () => {
    const cipher = new AesGcmSecretCipher();
    const payload = cifrarSecretoBackfill('smtp-super-secreto', 'cliente-123', VALID_KEY_HEX);

    expect(cipher.decrypt(payload, 'cliente-123')).toBe('smtp-super-secreto');
  });

  it('lo que cifra AesGcmSecretCipher lo descifra el script (viceversa)', () => {
    const cipher = new AesGcmSecretCipher();
    const payload = cipher.encrypt('otra-contraseña', 'cliente-456');

    expect(descifrarSecretoBackfill(payload, 'cliente-456', VALID_KEY_HEX)).toBe('otra-contraseña');
  });

  it('el formato coincide byte a byte: prefijo v1 y 4 segmentos', () => {
    const payload = cifrarSecretoBackfill('valor', 'cliente-1', VALID_KEY_HEX);
    const segments = payload.split(':');

    expect(payload.startsWith('v1:')).toBe(true);
    expect(segments).toHaveLength(4);
  });

  it('un aad distinto al usado para cifrar es rechazado también del lado del script', () => {
    const cipher = new AesGcmSecretCipher();
    const payload = cipher.encrypt('valor-original', 'cliente-A');

    expect(() => descifrarSecretoBackfill(payload, 'cliente-B', VALID_KEY_HEX)).toThrow();
  });
});

describe('leerConfigDesdeEnv() — el CHECK todo-o-nada exige abortar ante cualquier faltante', () => {
  const ENV_COMPLETO = {
    SMTP_HOST: 'smtp.legacy.test',
    SMTP_PORT: '587',
    SMTP_USER: 'legacy@test.local',
    SMTP_PASSWORD: 'legacy-password',
    SMTP_FROM: 'no-reply@test.local',
    SMTP_SECURE: 'false',
    EMAIL_CRYPTO_KEY: VALID_KEY_HEX,
  };

  it('con todas las env vars presentes, devuelve la config validada', () => {
    const config = leerConfigDesdeEnv(ENV_COMPLETO);

    expect(config).toEqual({
      smtpHost: 'smtp.legacy.test',
      smtpPort: 587,
      smtpUser: 'legacy@test.local',
      smtpPassword: 'legacy-password',
      smtpFrom: 'no-reply@test.local',
      smtpSecure: false,
      emailCryptoKey: VALID_KEY_HEX,
    });
  });

  it.each(['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM', 'SMTP_SECURE', 'EMAIL_CRYPTO_KEY'])(
    'aborta si falta %s',
    (clave) => {
      const envIncompleto = { ...ENV_COMPLETO, [clave]: undefined };

      expect(() => leerConfigDesdeEnv(envIncompleto)).toThrow(new RegExp(clave));
    },
  );
});
