/**
 * cifrado-secreto-v1.spec.ts — WU1 (sdd/rotacion-email-crypto-key).
 *
 * `scripts/lib/cifrado-secreto-v1.mjs` DUPLICA el cifrado de
 * `AesGcmSecretCipher` porque los scripts no pueden importar `src/` sin
 * build (ver cabecera del módulo). Este es el test que ata las dos
 * implementaciones: si divergen en silencio, una fila re-cifrada por
 * `rotar-email-crypto-key.mjs` queda indescifrable para el resto de la
 * aplicación y nadie lo nota hasta que un correo no sale.
 *
 * Molde: `backend/scripts/backfill-correo-clientes.spec.ts` (read-only).
 * Ref design: WU1, ADR-5. Ref tasks: 1.2.
 */
import { AesGcmSecretCipher } from '../../src/shared/infrastructure/crypto/aes-gcm-secret-cipher';
import { cifrarV1, descifrarV1, leerClaveHex } from './cifrado-secreto-v1.mjs';

const CLAVE_A_HEX = 'a'.repeat(64);
const CLAVE_B_HEX = 'b'.repeat(64);

describe('cifrado-secreto-v1 — descifrado cruzado con AesGcmSecretCipher', () => {
  const originalEnv = process.env.EMAIL_CRYPTO_KEY;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.EMAIL_CRYPTO_KEY;
    } else {
      process.env.EMAIL_CRYPTO_KEY = originalEnv;
    }
  });

  it('lo que cifra el script lo descifra AesGcmSecretCipher (mismo AAD)', () => {
    process.env.EMAIL_CRYPTO_KEY = CLAVE_A_HEX;
    const cipher = new AesGcmSecretCipher();
    const claveBuffer = leerClaveHex(CLAVE_A_HEX);

    const payload = cifrarV1(claveBuffer, 'smtp-super-secreto', 'cliente-123');

    expect(cipher.decrypt(payload, 'cliente-123')).toBe('smtp-super-secreto');
  });

  it('lo que cifra AesGcmSecretCipher lo descifra el script (viceversa)', () => {
    process.env.EMAIL_CRYPTO_KEY = CLAVE_A_HEX;
    const cipher = new AesGcmSecretCipher();
    const claveBuffer = leerClaveHex(CLAVE_A_HEX);

    const payload = cipher.encrypt('otra-contraseña', 'cliente-456');

    expect(descifrarV1(claveBuffer, payload, 'cliente-456')).toBe('otra-contraseña');
  });

  it('el formato coincide byte a byte: prefijo v1 y 4 segmentos', () => {
    const claveBuffer = leerClaveHex(CLAVE_A_HEX);
    const payload = cifrarV1(claveBuffer, 'valor', 'cliente-1');
    const segments = payload.split(':');

    expect(payload.startsWith('v1:')).toBe(true);
    expect(segments).toHaveLength(4);
  });

  it('un payload se rechaza con un AAD ajeno al usado para cifrar', () => {
    const claveBuffer = leerClaveHex(CLAVE_A_HEX);
    const payload = cifrarV1(claveBuffer, 'valor-original', 'cliente-A');

    expect(() => descifrarV1(claveBuffer, payload, 'cliente-B')).toThrow();
  });

  it('un payload se rechaza con una clave ajena a la usada para cifrar', () => {
    const claveA = leerClaveHex(CLAVE_A_HEX);
    const claveB = leerClaveHex(CLAVE_B_HEX);
    const payload = cifrarV1(claveA, 'valor-original', 'cliente-1');

    expect(() => descifrarV1(claveB, payload, 'cliente-1')).toThrow();
  });

  it('un AAD ajeno también es rechazado del lado de AesGcmSecretCipher sobre un payload del script', () => {
    process.env.EMAIL_CRYPTO_KEY = CLAVE_A_HEX;
    const cipher = new AesGcmSecretCipher();
    const claveBuffer = leerClaveHex(CLAVE_A_HEX);
    const payload = cifrarV1(claveBuffer, 'valor-original', 'cliente-A');

    expect(() => cipher.decrypt(payload, 'cliente-B')).toThrow();
  });
});

describe('leerClaveHex()', () => {
  it('decodifica una clave hex de 64 caracteres a un Buffer de 32 bytes', () => {
    const buffer = leerClaveHex(CLAVE_A_HEX);

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBe(32);
  });

  it.each([
    ['vacía', ''],
    ['muy corta', 'ab'.repeat(10)],
    ['no hexadecimal', 'z'.repeat(64)],
    ['no es string', undefined],
  ])('devuelve null ante una clave %s', (_descripcion, valor) => {
    expect(leerClaveHex(valor)).toBeNull();
  });
});
