/**
 * rotar-email-crypto-key.spec.ts — WU1 (sdd/rotacion-email-crypto-key).
 *
 * Cubre la parte pura de la rotación que no toca la base: validación de
 * `OLD_KEY`/`NEW_KEY` (spec: "Validación de las claves de entrada") y la
 * clasificación por fila de la tabla ADR-1. La transacción real
 * (`ejecutarRotacion`) se prueba en `rotar-email-crypto-key.integration.spec.ts`
 * (WU2a), con base efímera.
 *
 * Molde: `backend/scripts/backfill-correo-clientes.spec.ts` (read-only),
 * para setear `process.env.EMAIL_CRYPTO_KEY` y generar payloads reales vía
 * `AesGcmSecretCipher`. Ref tasks: 1.5, 2b.1 (`validarClaveVerificar`).
 */
import { AesGcmSecretCipher } from '../src/shared/infrastructure/crypto/aes-gcm-secret-cipher';
import { leerClaveHex } from './lib/cifrado-secreto-v1.mjs';
import { clasificarFila, validarClaveVerificar, validarClaves } from './rotar-email-crypto-key.mjs';

const OLD_KEY_HEX = 'a'.repeat(64);
const NEW_KEY_HEX = 'b'.repeat(64);

describe('validarClaves() — R1: longitud, formato hex y OLD !== NEW comparadas como bytes', () => {
  it('con OLD_KEY y NEW_KEY válidas y distintas, devuelve los buffers decodificados', () => {
    const resultado = validarClaves(OLD_KEY_HEX, NEW_KEY_HEX);

    expect(resultado.oldKeyBuf).toEqual(Buffer.from(OLD_KEY_HEX, 'hex'));
    expect(resultado.newKeyBuf).toEqual(Buffer.from(NEW_KEY_HEX, 'hex'));
  });

  it('rechaza OLD_KEY con longitud inválida antes de mirar NEW_KEY', () => {
    expect(() => validarClaves('ab', NEW_KEY_HEX)).toThrow(/OLD_KEY inválida/);
  });

  it('rechaza NEW_KEY con longitud inválida', () => {
    expect(() => validarClaves(OLD_KEY_HEX, 'ab')).toThrow(/NEW_KEY inválida/);
  });

  it('rechaza una clave no hexadecimal', () => {
    expect(() => validarClaves('z'.repeat(64), NEW_KEY_HEX)).toThrow(/OLD_KEY inválida/);
  });

  it('rechaza OLD_KEY y NEW_KEY iguales', () => {
    expect(() => validarClaves(OLD_KEY_HEX, OLD_KEY_HEX)).toThrow(
      /OLD_KEY y NEW_KEY son la misma clave/,
    );
  });

  it('rechaza OLD_KEY y NEW_KEY que representan la misma clave en mayúsculas/minúsculas (comparación por bytes)', () => {
    expect(() => validarClaves(OLD_KEY_HEX, OLD_KEY_HEX.toUpperCase())).toThrow(
      /OLD_KEY y NEW_KEY son la misma clave/,
    );
  });
});

describe('validarClaveVerificar() — R11: formato de ROTACION_VERIFICAR_KEY', () => {
  it('con una clave válida, devuelve el buffer decodificado', () => {
    expect(validarClaveVerificar(NEW_KEY_HEX)).toEqual(Buffer.from(NEW_KEY_HEX, 'hex'));
  });

  it('rechaza una clave con longitud inválida', () => {
    expect(() => validarClaveVerificar('ab')).toThrow(/ROTACION_VERIFICAR_KEY inválida/);
  });

  it('rechaza una clave no hexadecimal', () => {
    expect(() => validarClaveVerificar('z'.repeat(64))).toThrow(/ROTACION_VERIFICAR_KEY inválida/);
  });
});

describe('clasificarFila() — tabla ADR-1', () => {
  const originalEnv = process.env.EMAIL_CRYPTO_KEY;
  const oldKeyBuf = leerClaveHex(OLD_KEY_HEX);
  const newKeyBuf = leerClaveHex(NEW_KEY_HEX);

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.EMAIL_CRYPTO_KEY;
    } else {
      process.env.EMAIL_CRYPTO_KEY = originalEnv;
    }
  });

  it('fila que descifra con OLD_KEY (y no se prueba NEW_KEY) → pendiente, con el texto plano', () => {
    process.env.EMAIL_CRYPTO_KEY = OLD_KEY_HEX;
    const cipher = new AesGcmSecretCipher();
    const fila = {
      id: 'cliente-1',
      smtp_password_cifrada: cipher.encrypt('secreto-1', 'cliente-1'),
    };

    expect(clasificarFila(fila, oldKeyBuf, newKeyBuf)).toEqual({
      estado: 'pendiente',
      textoPlano: 'secreto-1',
    });
  });

  it('fila que ya descifra con NEW_KEY (y no con OLD_KEY) → ya_migrada', () => {
    process.env.EMAIL_CRYPTO_KEY = NEW_KEY_HEX;
    const cipher = new AesGcmSecretCipher();
    const fila = {
      id: 'cliente-2',
      smtp_password_cifrada: cipher.encrypt('secreto-2', 'cliente-2'),
    };

    expect(clasificarFila(fila, oldKeyBuf, newKeyBuf)).toEqual({ estado: 'ya_migrada' });
  });

  it('fila que no descifra con ninguna clave → indescifrable', () => {
    process.env.EMAIL_CRYPTO_KEY = 'c'.repeat(64);
    const cipher = new AesGcmSecretCipher();
    const fila = {
      id: 'cliente-3',
      smtp_password_cifrada: cipher.encrypt('secreto-3', 'cliente-3'),
    };

    expect(clasificarFila(fila, oldKeyBuf, newKeyBuf)).toEqual({ estado: 'indescifrable' });
  });

  it('fila con AAD equivocado (payload de otro cliente) → indescifrable, no pendiente ni ya_migrada', () => {
    process.env.EMAIL_CRYPTO_KEY = OLD_KEY_HEX;
    const cipher = new AesGcmSecretCipher();
    const payloadDeOtroCliente = cipher.encrypt('secreto-4', 'cliente-4');
    const fila = { id: 'cliente-distinto', smtp_password_cifrada: payloadDeOtroCliente };

    expect(clasificarFila(fila, oldKeyBuf, newKeyBuf)).toEqual({ estado: 'indescifrable' });
  });

  it.each([
    ['sin el prefijo v1', 'v2:aWF2:dGFn:Y3Q='],
    ['con menos de 4 segmentos', 'v1:soloDosSegmentos'],
    ['con más de 4 segmentos', 'v1:a:b:c:d'],
    ['vacío', ''],
  ])('payload malformado (%s) → indescifrable', (_descripcion, payload) => {
    const fila = { id: 'cliente-5', smtp_password_cifrada: payload };

    expect(clasificarFila(fila, oldKeyBuf, newKeyBuf)).toEqual({ estado: 'indescifrable' });
  });
});
