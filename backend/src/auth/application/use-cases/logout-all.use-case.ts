import { Result } from '../../../shared/domain/result';
import { DomainError } from '../../../shared/domain/result';
import { IDispositivoConfiableRepository } from '../../domain/ports/dispositivo-confiable-repository.port';
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
 * Delega en el repo (bulk update). Idempotente: si el usuario no tiene tokens
 * activos, retorna ok sin error. Ademas revoca TODOS sus dispositivos confiables
 * del segundo paso (decision del dueno, 2026-10-08): el codigo se vuelve a pedir en
 * todos lados. La revocacion es fail-closed (lanza ante fallo), como en el cambio de
 * contrasena; el logout normal NO la hace.
 */
export class LogoutAllUseCase {
  constructor(
    private readonly refreshTokenRepo: IRefreshTokenRepository,
    private readonly dispositivos: IDispositivoConfiableRepository,
  ) {}

  async execute(dto: LogoutAllDto): Promise<Result<void, DomainError>> {
    await this.refreshTokenRepo.revokeAllByUsuarioId(dto.usuarioId);
    await this.dispositivos.revocarTodosDe(dto.usuarioId);
    return Result.ok(undefined as unknown as void);
  }
}
