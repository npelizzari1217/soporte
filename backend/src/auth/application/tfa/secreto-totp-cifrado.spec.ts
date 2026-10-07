import { AesGcmSecretCipher } from '../../../shared/infrastructure/crypto/aes-gcm-secret-cipher';
import { SecretoTotpCifrado } from './secreto-totp-cifrado';

describe('SecretoTotpCifrado', () => {
  const clave = 'ab'.repeat(32);
  let previa: string | undefined;
  let secretos: SecretoTotpCifrado;
  let cipher: AesGcmSecretCipher;

  beforeEach(() => {
    previa = process.env.EMAIL_CRYPTO_KEY;
    process.env.EMAIL_CRYPTO_KEY = clave;
    cipher = new AesGcmSecretCipher();
    secretos = new SecretoTotpCifrado(cipher);
  });
  afterEach(() => {
    if (previa === undefined) delete process.env.EMAIL_CRYPTO_KEY;
    else process.env.EMAIL_CRYPTO_KEY = previa;
  });

  it('cifra con AAD tfa:{usuarioId} y descifra al mismo usuario', () => {
    const payload = secretos.cifrar('u1', 'JBSWY3DPEHPK3PXP');
    expect(cipher.decrypt(payload, 'tfa:u1')).toBe('JBSWY3DPEHPK3PXP');
    expect(secretos.descifrar('u1', payload).getValue()).toBe('JBSWY3DPEHPK3PXP');
  });

  it('un ciphertext SMTP (AAD = id de cliente) no descifra como TOTP (K1)', () => {
    const smtp = cipher.encrypt('clave-smtp', 'u1');
    expect(secretos.descifrar('u1', smtp).isFail()).toBe(true);
  });

  it('un ciphertext movido entre usuarios falla sin lanzar (T12)', () => {
    const payload = secretos.cifrar('u1', 'JBSWY3DPEHPK3PXP');
    expect(secretos.descifrar('u2', payload).isFail()).toBe(true);
  });

  it('un payload roto devuelve Result.fail, nunca lanza (T12)', () => {
    expect(secretos.descifrar('u1', 'basura').isFail()).toBe(true);
  });
});
