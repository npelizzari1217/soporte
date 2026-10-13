import { AesGcmSecretCipher } from '../../shared/infrastructure/crypto/aes-gcm-secret-cipher';
import { SecretoWebhookCifrado } from './secreto-webhook-cifrado';

describe('SecretoWebhookCifrado', () => {
  const clave = 'cd'.repeat(32);
  let previa: string | undefined;
  let secretos: SecretoWebhookCifrado;
  let cipher: AesGcmSecretCipher;

  beforeEach(() => {
    previa = process.env.EMAIL_CRYPTO_KEY;
    process.env.EMAIL_CRYPTO_KEY = clave;
    cipher = new AesGcmSecretCipher();
    secretos = new SecretoWebhookCifrado(cipher);
  });
  afterEach(() => {
    if (previa === undefined) delete process.env.EMAIL_CRYPTO_KEY;
    else process.env.EMAIL_CRYPTO_KEY = previa;
  });

  it('cifra con AAD webhook:{clienteId} y descifra para el mismo cliente', () => {
    const payload = secretos.cifrar('c1', 'whsec_abc');
    expect(payload).not.toContain('whsec_abc');
    expect(cipher.decrypt(payload, 'webhook:c1')).toBe('whsec_abc');
    expect(secretos.descifrar('c1', payload).getValue()).toBe('whsec_abc');
  });

  it('un ciphertext SMTP del mismo cliente (AAD = id) no descifra como secreto de webhook', () => {
    const smtp = cipher.encrypt('clave-smtp', 'c1');
    expect(secretos.descifrar('c1', smtp).isFail()).toBe(true);
  });

  it('un ciphertext movido a otro cliente falla sin lanzar', () => {
    const payload = secretos.cifrar('c1', 'whsec_abc');
    const r = secretos.descifrar('c2', payload);
    expect(r.isFail()).toBe(true);
    expect(r.getError().code).toBe('WEBHOOK_SECRETO_INDESCIFRABLE');
  });

  it('un payload roto devuelve Result.fail, nunca lanza', () => {
    expect(secretos.descifrar('c1', 'basura').isFail()).toBe(true);
  });
});
