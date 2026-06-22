import { Result } from '../../../shared/domain/result';
import { DomainError } from '../../../shared/domain/result';
import { IRefreshTokenRepository } from '../../domain/ports/i-refresh-token.repository';

/** DTO de entrada para RevocarTodosTokensUsuarioUseCase. */
export interface RevocarTodosTokensDto {
  /** ID del usuario cuyos tokens se revocan. */
  usuarioId: string;
}

/**
 * RevocarTodosTokensUsuarioUseCase — revoca todos los refresh tokens de un usuario (bulk).
 *
 * Usado cuando:
 * - Un administrador suspende una cuenta.
 * - El propio usuario hace "logout de todos los dispositivos".
 * - BajaUsuarioUseCase lo invoca para invalidar todas las sesiones activas.
 *
 * Delega completamente al repo (bulk update en DB).
 * Es idempotente: si no hay tokens activos, retorna ok sin error.
 *
 * Tarea: 2.B.6
 */
export class RevocarTodosTokensUsuarioUseCase {
  constructor(private readonly refreshTokenRepo: IRefreshTokenRepository) {}

  async execute(dto: RevocarTodosTokensDto): Promise<Result<void, DomainError>> {
    await this.refreshTokenRepo.revokeAllByUsuarioId(dto.usuarioId);
    return Result.ok(undefined as unknown as void);
  }
}
