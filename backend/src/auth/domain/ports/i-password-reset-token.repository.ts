import { PasswordResetTokenEntity } from '../entities/password-reset-token.entity';

/**
 * IPasswordResetTokenRepository — puerto de persistencia para
 * `PasswordResetTokenEntity` (MASTER, `password_reset_tokens`). Definido en
 * la capa de dominio: sin imports de Prisma ni NestJS.
 *
 * Molde: `IEncuestaTokenRepository`. Difiere en que acá la revocación en
 * bloque es por usuario (`revocarVigentesDeUsuario`), no por ticket, y no
 * hay `liberarUso`: no hay INSERT en el tenant que compensar (ADR-5 —
 * `save()` del usuario, no una fila nueva en otra base).
 *
 * Ref design: ADR-5, ADR-6 (CAS de uso único). Tarea: 2.1.
 */
export interface IPasswordResetTokenRepository {
  /** Busca un token por su hash SHA-256. `null` si no existe ninguna fila. */
  findByHash(tokenHash: string): Promise<PasswordResetTokenEntity | null>;

  /** Persiste el token (upsert: crea si no existe, actualiza si existe). */
  save(token: PasswordResetTokenEntity): Promise<void>;

  /**
   * Revoca en bloque los tokens VIGENTES (no usados, no revocados) del
   * usuario dado. Idempotente — una segunda llamada sin tokens vigentes
   * devuelve 0. Usado por `SolicitarResetPasswordUseCase` antes de emitir
   * uno nuevo (Requirement "Emitir un token nuevo revoca los vigentes del
   * usuario").
   *
   * @returns La cantidad de tokens revocados.
   */
  revocarVigentesDeUsuario(usuarioId: string): Promise<number>;

  /**
   * CAS de uso único (ADR-5/ADR-6): `UPDATE password_reset_tokens SET
   * used_at = now() WHERE id = tokenId AND used_at IS NULL AND revoked_at IS
   * NULL AND expires_at > now()`. Devuelve `true` únicamente si ESTA llamada
   * fue la que marcó el token como usado — `false` si ya estaba usado,
   * revocado o vencido (afectó 0 filas). El caller usa el resultado para
   * decidir si procede a cambiar la contraseña.
   */
  consumirSiVigente(tokenId: string): Promise<boolean>;
}

/** Token de inyección de dependencias para IPasswordResetTokenRepository en NestJS. */
export const PASSWORD_RESET_TOKEN_REPOSITORY = Symbol('PASSWORD_RESET_TOKEN_REPOSITORY');
