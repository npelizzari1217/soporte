import * as crypto from 'crypto';
import { Result } from '../../../shared/domain/result';
import { DomainError } from '../../../shared/domain/result';
import { IRefreshTokenRepository } from '../../domain/ports/i-refresh-token.repository';
import { TokenInvalidoError } from '../../domain/errors/auth.errors';

/** DTO de entrada para RevocarTokenUseCase. */
export interface RevocarTokenDto {
  /** Token crudo recibido del cliente. */
  rawToken: string;
}

/**
 * RevocarTokenUseCase — revoca un refresh token individual (logout de un dispositivo).
 *
 * Flujo:
 * 1. Computa SHA-256(rawToken) y busca en refresh_tokens.
 * 2. Si no existe → TokenInvalidoError.
 * 3. Llama token.revoke() (setea revoked_at = now).
 * 4. Persiste el cambio.
 *
 * Es idempotente: revocar un token ya revocado retorna ok (sin error).
 *
 * Tarea: 2.B.6
 */
export class RevocarTokenUseCase {
  constructor(private readonly refreshTokenRepo: IRefreshTokenRepository) {}

  async execute(dto: RevocarTokenDto): Promise<Result<void, DomainError>> {
    const tokenHash = crypto.createHash('sha256').update(dto.rawToken).digest('hex');
    const token = await this.refreshTokenRepo.findByHash(tokenHash);

    if (!token) {
      return Result.fail(new TokenInvalidoError());
    }

    // Idempotente: revoke() no hace nada si ya estaba revocado
    token.revoke();
    await this.refreshTokenRepo.save(token);

    return Result.ok(undefined as unknown as void);
  }
}
