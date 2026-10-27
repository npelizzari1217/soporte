import { AesGcmSecretCipher } from '../../shared/infrastructure/crypto/aes-gcm-secret-cipher';
import { ClaveIaIndescifrableError } from '../domain/asistente.errors';
import { ClaveIaCifrada } from './clave-ia-cifrada';

describe('ClaveIaCifrada', () => {
  let previa: string | undefined;
  let cipher: AesGcmSecretCipher;
  let claves: ClaveIaCifrada;

  beforeEach(() => {
    previa = process.env.EMAIL_CRYPTO_KEY;
    process.env.EMAIL_CRYPTO_KEY = 'cd'.repeat(32);
    cipher = new AesGcmSecretCipher();
    claves = new ClaveIaCifrada(cipher);
  });
  afterEach(() => {
    if (previa === undefined) delete process.env.EMAIL_CRYPTO_KEY;
    else process.env.EMAIL_CRYPTO_KEY = previa;
  });

  it('cifra con AAD ia:{clienteId} y descifra para el mismo cliente', () => {
    const payload = claves.cifrar('c1', 'AIzaClave');
    expect(payload).not.toContain('AIzaClave');
    expect(cipher.decrypt(payload, 'ia:c1')).toBe('AIzaClave');
    expect(claves.descifrar('c1', payload).getValue()).toBe('AIzaClave');
  });

  it('una clave de otro cliente no descifra', () => {
    const r = claves.descifrar('c2', claves.cifrar('c1', 'AIzaClave'));
    expect(r.getError()).toBeInstanceOf(ClaveIaIndescifrableError);
  });

  it('un ciphertext SMTP o de webhook del mismo cliente no descifra como clave de IA', () => {
    expect(claves.descifrar('c1', cipher.encrypt('smtp', 'c1')).isFail()).toBe(true);
    expect(claves.descifrar('c1', cipher.encrypt('whsec', 'webhook:c1')).isFail()).toBe(true);
  });

  it('cifrar lanza si falta EMAIL_CRYPTO_KEY', () => {
    delete process.env.EMAIL_CRYPTO_KEY;
    const sinClave = new ClaveIaCifrada(new AesGcmSecretCipher());
    expect(() => sinClave.cifrar('c1', 'AIzaClave')).toThrow();
  });
});
