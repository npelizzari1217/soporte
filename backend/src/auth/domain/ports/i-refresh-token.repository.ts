import { RefreshTokenEntity } from '../entities/refresh-token.entity';

/**
 * IRefreshTokenRepository — puerto de persistencia para RefreshToken.
 *
 * Definido en la capa de dominio: sin imports de Prisma ni NestJS.
 * La implementación concreta vive en auth/infrastructure/persistence/prisma/ → PR-06.
 *
 * Tarea: 2.A.3
 */
export interface IRefreshTokenRepository {
  /**
   * Busca un refresh token por su hash SHA-256.
   * El lookup siempre es por hash (el crudo nunca se persiste).
   *
   * @param tokenHash  Hash SHA-256 del token crudo.
   * @returns          Entidad del token si existe, null en caso contrario.
   */
  findByHash(tokenHash: string): Promise<RefreshTokenEntity | null>;

  /**
   * Revoca masivamente todos los refresh tokens activos de un usuario.
   * Usado en BajaUsuarioUseCase y RevocarTodosTokensUsuarioUseCase.
   * Setea revoked_at = now() en todas las filas del usuario_id.
   *
   * @param usuarioId  ID del usuario cuyos tokens se revocan.
   */
  revokeAllByUsuarioId(usuarioId: string): Promise<void>;

  /**
   * Persiste un refresh token (crea si no existe, actualiza si existe).
   * Usado al emitir un nuevo token (login / rotación) o al revocar uno individual.
   */
  save(token: RefreshTokenEntity): Promise<void>;
}

/** Token de inyección de dependencias para IRefreshTokenRepository en NestJS. */
export const REFRESH_TOKEN_REPOSITORY = Symbol('REFRESH_TOKEN_REPOSITORY');
