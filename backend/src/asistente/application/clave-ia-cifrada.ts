import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../shared/domain/result';
import { ISecretCipher, SECRET_CIPHER } from '../../shared/domain/ports/i-secret-cipher.port';
import { ClaveIaIndescifrableError } from '../domain/asistente.errors';

/**
 * Cifra la clave del proveedor de IA con `EMAIL_CRYPTO_KEY` y AAD `ia:{clienteId}`, el mismo que usa
 * `scripts/rotar-email-crypto-key.mjs`. Con ese AAD, un ciphertext SMTP, TOTP o de webhook, o uno
 * movido a otro cliente, no descifra. Mismo criterio que `SecretoWebhookCifrado`.
 *
 * `cifrar` lanza si falta la clave del servidor (lo traduce el caso de uso, antes de escribir nada);
 * `descifrar` devuelve un `Result`, porque una clave guardada que no descifra es un estado esperable
 * (rotación incompleta) y no un error de programación.
 */
@Injectable()
export class ClaveIaCifrada {
  constructor(@Inject(SECRET_CIPHER) private readonly cipher: ISecretCipher) {}

  /** Cifra la clave en claro para el cliente. Lanza si `EMAIL_CRYPTO_KEY` falta o es inválida. */
  cifrar(clienteId: string, clave: string): string {
    return this.cipher.encrypt(clave, aad(clienteId));
  }

  /** Descifra la clave guardada del cliente. */
  descifrar(clienteId: string, payload: string): Result<string, ClaveIaIndescifrableError> {
    try {
      return Result.ok(this.cipher.decrypt(payload, aad(clienteId)));
    } catch {
      return Result.fail(new ClaveIaIndescifrableError());
    }
  }
}

const aad = (clienteId: string): string => `ia:${clienteId}`;
