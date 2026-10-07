import { Inject, Injectable } from '@nestjs/common';
import { Result } from '../../../shared/domain/result';
import { ISecretCipher, SECRET_CIPHER } from '../../../shared/domain/ports/i-secret-cipher.port';
import { SecretoTotpIndescifrableError } from '../../domain/errors/tfa.errors';

/**
 * Envuelve `ISecretCipher` con AAD `tfa:{usuarioId}` (ADR-5): un ciphertext SMTP, o uno movido
 * a otro usuario, no descifra. El fallo de descifrado es un `Result`, nunca una excepcion (T12).
 */
@Injectable()
export class SecretoTotpCifrado {
  constructor(@Inject(SECRET_CIPHER) private readonly cipher: ISecretCipher) {}

  cifrar(usuarioId: string, secreto: string): string {
    return this.cipher.encrypt(secreto, aad(usuarioId));
  }

  descifrar(usuarioId: string, payload: string): Result<string, SecretoTotpIndescifrableError> {
    try {
      return Result.ok(this.cipher.decrypt(payload, aad(usuarioId)));
    } catch {
      return Result.fail(new SecretoTotpIndescifrableError());
    }
  }
}

const aad = (usuarioId: string): string => `tfa:${usuarioId}`;
