import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../shared/domain/result';
import { ISecretCipher, SECRET_CIPHER } from '../../shared/domain/ports/i-secret-cipher.port';
import { SecretoWebhookIndescifrableError } from '../domain/integraciones.errors';

/**
 * Cifra el secreto de firma de los webhooks con `EMAIL_CRYPTO_KEY` y AAD `webhook:{clienteId}`,
 * el mismo que usa `scripts/rotar-email-crypto-key.mjs`. Con ese AAD, un ciphertext SMTP o TOTP, o
 * uno movido a otro cliente, no descifra. El fallo de descifrado es un `Result`, nunca una excepcion.
 * Mismo criterio que `SecretoTotpCifrado`: el repositorio solo guarda el payload cifrado.
 */
@Injectable()
export class SecretoWebhookCifrado {
  constructor(@Inject(SECRET_CIPHER) private readonly cipher: ISecretCipher) {}

  cifrar(clienteId: string, secreto: string): string {
    return this.cipher.encrypt(secreto, aad(clienteId));
  }

  descifrar(clienteId: string, payload: string): Result<string, SecretoWebhookIndescifrableError> {
    try {
      return Result.ok(this.cipher.decrypt(payload, aad(clienteId)));
    } catch {
      return Result.fail(new SecretoWebhookIndescifrableError());
    }
  }
}

const aad = (clienteId: string): string => `webhook:${clienteId}`;
