import { EncuestaTokenEntity } from '../entities/encuesta-token.entity';

/**
 * IEncuestaTokenRepository — puerto de persistencia para `EncuestaTokenEntity`
 * (MASTER, `encuesta_tokens`). Definido en la capa de dominio: sin imports de
 * Prisma ni NestJS. La implementación concreta (`PrismaEncuestaTokenRepository`,
 * WU5) usa el `PrismaClient` de MASTER directamente — el token vive fuera del
 * scope del tenant.
 *
 * Ref design: ADR-C1 (`ResolverEncuestaTokenService`), ADR-C2 (CAS de uso
 * único). Tarea: 4.5.
 */
export interface IEncuestaTokenRepository {
  /** Busca un token por su hash SHA-256. `null` si no existe ninguna fila. */
  findByHash(tokenHash: string): Promise<EncuestaTokenEntity | null>;

  /** Persiste el token (upsert: crea si no existe, actualiza si existe). */
  save(token: EncuestaTokenEntity): Promise<void>;

  /**
   * Revoca en bloque los tokens VIGENTES (no usados, no revocados) del
   * ticket dado. Idempotente — una segunda llamada sin tokens vigentes
   * devuelve 0. Usado por `EmitirEncuestaUseCase` antes de emitir uno nuevo
   * (reapertura del ticket, WU6).
   *
   * @returns La cantidad de tokens revocados.
   */
  revocarVigentesDeTicket(clienteId: string, ticketId: string): Promise<number>;

  /**
   * CAS de uso único (ADR-C2): `UPDATE encuesta_tokens SET used_at = now()
   * WHERE id = tokenId AND used_at IS NULL`. Devuelve `true` únicamente si
   * ESTA llamada fue la que marcó el token como usado — `false` si ya
   * estaba usado (afectó 0 filas). El caller usa el resultado para decidir
   * si procede con el INSERT en el tenant.
   */
  marcarUsadoSiNoUsado(tokenId: string): Promise<boolean>;

  /**
   * Compensación best-effort: libera el uso (`used_at = NULL`) si el INSERT
   * en el tenant falló DESPUÉS de un `marcarUsadoSiNoUsado` exitoso (no hay
   * transacción entre MASTER y el tenant — ADR-C2).
   */
  liberarUso(tokenId: string): Promise<void>;
}

/** Token de inyección de dependencias para IEncuestaTokenRepository en NestJS. */
export const ENCUESTA_TOKEN_REPOSITORY = Symbol('ENCUESTA_TOKEN_REPOSITORY');
