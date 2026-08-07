import { Result } from '../../../shared/domain/result';
import { DomainError } from '../../../shared/domain/result';
import { IRefreshTokenRepository } from '../../domain/ports/i-refresh-token.repository';

/** DTO de entrada para LogoutAllUseCase. */
export interface LogoutAllDto {
  /** ID del usuario autenticado cuyos refresh tokens se revocan. */
  usuarioId: string;
}

/**
 * LogoutAllUseCase — revoca TODOS los refresh tokens activos de un usuario
 * ("logout de todos los dispositivos", R9).
 *
 * Delega completamente en el repo (bulk update). Idempotente: si el usuario
 * no tiene tokens activos, retorna ok sin error.
 */
export class LogoutAllUseCase {
  constructor(private readonly refreshTokenRepo: IRefreshTokenRepository) {}

  async execute(dto: LogoutAllDto): Promise<Result<void, DomainError>> {
    await this.refreshTokenRepo.revokeAllByUsuarioId(dto.usuarioId);
    return Result.ok(undefined as unknown as void);
  }
}
