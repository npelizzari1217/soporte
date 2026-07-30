import { DomainError } from '../result';

/**
 * CifradoError — fallo de cifrado/descifrado de un secreto (ISecretCipher).
 *
 * Cubre: clave de cifrado ausente/inválida en el momento del cifrado/descifrado
 * de UNA FILA de datos, `authTag` alterado (tampering), o payload corrupto.
 * Distinta de la validación de PRESENCIA+FORMA de `CONFIG_ENCRYPTION_KEY` al
 * bootstrap (F1) — esa es fail-fast e independiente de esta clase.
 *
 * El `message` NUNCA interpola el plaintext ni la clave (spec R2 — el secreto
 * en claro nunca aparece fuera de memoria, ni siquiera en un error).
 *
 * Ref design: §5. Ref spec: R2. Tarea: 1.8 (PR1).
 */
export class CifradoError extends DomainError {
  readonly code = 'CONFIG_CIFRADO_INVALIDO' as const;

  constructor(message: string) {
    super(message);
  }
}
