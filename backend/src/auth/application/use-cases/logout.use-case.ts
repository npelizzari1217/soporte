import * as crypto from 'crypto';
import { Result } from '../../../shared/domain/result';
import { DomainError } from '../../../shared/domain/result';
import { IRefreshTokenRepository } from '../../domain/ports/i-refresh-token.repository';
import { TokenInvalidoError } from '../../domain/errors/auth.errors';

/** DTO de entrada para LogoutUseCase. */
export interface LogoutDto {
  /** Token crudo recibido del cliente (httpOnly cookie `rt`). */
  rawToken: string;
}

/**
 * LogoutUseCase — revoca el refresh token actual (logout de UN dispositivo/
 * sesión, R9).
 *
 * Flujo:
 * 1. Computa SHA-256(rawToken) y busca en refresh_tokens.
 * 2. Si no existe → TokenInvalidoError.
 * 3. `token.revoke()` (idempotente — no-op si ya estaba revocado) + persiste.
 */
export class LogoutUseCase {
  constructor(private readonly refreshTokenRepo: IRefreshTokenRepository) {}

  async execute(dto: LogoutDto): Promise<Result<void, DomainError>> {
    const tokenHash = crypto.createHash('sha256').update(dto.rawToken).digest('hex');
    const token = await this.refreshTokenRepo.findByHash(tokenHash);

    if (!token) {
      return Result.fail(new TokenInvalidoError());
    }

    token.revoke();
    await this.refreshTokenRepo.save(token);

    return Result.ok(undefined as unknown as void);
  }
}
