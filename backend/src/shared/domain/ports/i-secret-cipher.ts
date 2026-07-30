/**
 * ISecretCipher — puerto de cifrado/descifrado reversible de secretos (AES-256-GCM).
 *
 * Usado por el resolver de config (`configuracion/`) y el write use case para
 * cifrar/descifrar valores `esSecreto` de `ConfiguracionRuntime` (ej. `smtp.pass`).
 * Cross-dominio (resolver + write use case + adapter) ⇒ vive en `shared/domain`,
 * espejo de `IHashProvider` (que vive en `auth/` porque solo auth lo usa).
 *
 * Contrato de nunca-throw en `decrypt()`: la clave errónea o el tampering del
 * `authTag` se modelan como `Result.fail(CifradoError)`, NUNCA como excepción —
 * el resolver de config debe poder mapear ese fallo a un outcome tipado en
 * send-time sin necesitar try/catch adicional (spec R2, R6).
 *
 * La VALIDACIÓN de presencia/forma de `CONFIG_ENCRYPTION_KEY` es una
 * preocupación DISTINTA y vive en el boot (fail-fast, F1) — ver
 * `shared/infrastructure/crypto/config-encryption-key.ts` y el `useFactory`
 * de `SECRET_CIPHER` en `shared.module.ts`. `decrypt()`/`encrypt()` en sí
 * siguen siendo lazy respecto de la clave (nunca lanzan por clave inválida
 * en runtime — ese es un problema de FILA de datos, no de infraestructura).
 *
 * Ref design: §2 Dz2, §5, §6. Ref spec: R2. Tarea: 1.8 (PR1).
 */
import { CifradoError } from '../errors/cifrado.errors';
import { Result } from '../result';

/** Token de inyección de dependencias para ISecretCipher en NestJS. */
export const SECRET_CIPHER = Symbol('SECRET_CIPHER');

/**
 * Payload cifrado AES-256-GCM. Los 3 campos van en base64 y viajan juntos:
 * GCM necesita `iv` + `authTag` para descifrar y detectar tampering.
 */
export interface CipherPayload {
  valor: string;
  iv: string;
  authTag: string;
}

export interface ISecretCipher {
  /**
   * Cifra un plaintext con AES-256-GCM.
   * Clave ausente/inválida ⇒ `Result.fail(CifradoError)`, NUNCA throw.
   */
  encrypt(plaintext: string): Result<CipherPayload, CifradoError>;

  /**
   * Descifra + verifica `authTag`.
   * Clave equivocada, `authTag` alterado (tampering) o payload corrupto ⇒
   * `Result.fail(CifradoError code=CONFIG_CIFRADO_INVALIDO)`. NUNCA lanza.
   */
  decrypt(payload: CipherPayload): Result<string, CifradoError>;
}
