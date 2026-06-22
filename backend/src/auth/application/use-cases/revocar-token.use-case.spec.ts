/**
 * 2.B.5 TEST — Unit tests de RevocarTokenUseCase y RevocarTodosTokensUsuarioUseCase
 * (RED → GREEN con 2.B.6)
 *
 * RevocarTokenUseCase (individual):
 * - Revocación exitosa: setea revoked_at en el token
 * - Rechazo si token no existe → TokenInvalidoError
 * - No revoca si ya está revocado (idempotente — guarda de todas formas)
 *
 * RevocarTodosTokensUsuarioUseCase (bulk):
 * - Llama revokeAllByUsuarioId del repo
 * - Retorna ok aunque el usuario no tenga tokens activos (idempotente)
 */
import * as crypto from 'crypto';
import { RevocarTokenUseCase } from './revocar-token.use-case';
import { RevocarTodosTokensUsuarioUseCase } from './revocar-todos-tokens.use-case';
import { RefreshTokenEntity } from '../../domain/entities/refresh-token.entity';
import { IRefreshTokenRepository } from '../../domain/ports/i-refresh-token.repository';
import { TokenInvalidoError } from '../../domain/errors/auth.errors';

// ─── Factories ────────────────────────────────────────────────────────────────

const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

const makeToken = (
  overrides: Partial<{
    revokedAt: Date | null;
    tokenHash: string;
  }> = {},
): RefreshTokenEntity =>
  RefreshTokenEntity.create({
    usuarioId: 'usuario-uuid',
    tokenHash: overrides.tokenHash ?? 'sha256hash',
    expiresAt: future,
    revokedAt: overrides.revokedAt ?? null,
  });

const makeRefreshTokenRepo = (): jest.Mocked<IRefreshTokenRepository> => ({
  findByHash: jest.fn(),
  revokeAllByUsuarioId: jest.fn().mockResolvedValue(undefined),
  save: jest.fn().mockResolvedValue(undefined),
});

// ─── RevocarTokenUseCase tests ────────────────────────────────────────────────

describe('RevocarTokenUseCase', () => {
  let refreshTokenRepo: jest.Mocked<IRefreshTokenRepository>;
  let useCase: RevocarTokenUseCase;

  const rawToken = 'b'.repeat(64);
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

  beforeEach(() => {
    refreshTokenRepo = makeRefreshTokenRepo();
    useCase = new RevocarTokenUseCase(refreshTokenRepo);
  });

  describe('Revocación exitosa', () => {
    it('retorna ok cuando el token existe', async () => {
      refreshTokenRepo.findByHash.mockResolvedValue(makeToken({ tokenHash }));

      const result = await useCase.execute({ rawToken });

      expect(result.isOk()).toBe(true);
    });

    it('setea revoked_at en el token (llama a token.revoke())', async () => {
      const token = makeToken({ tokenHash });
      refreshTokenRepo.findByHash.mockResolvedValue(token);

      let savedToken: RefreshTokenEntity | undefined;
      refreshTokenRepo.save.mockImplementation(async (t) => {
        savedToken = t;
      });

      await useCase.execute({ rawToken });

      expect(savedToken).toBeDefined();
      expect(savedToken!.isRevoked()).toBe(true);
    });

    it('busca el token por SHA-256(rawToken)', async () => {
      refreshTokenRepo.findByHash.mockResolvedValue(makeToken({ tokenHash }));

      await useCase.execute({ rawToken });

      expect(refreshTokenRepo.findByHash).toHaveBeenCalledWith(tokenHash);
    });

    it('persiste el token revocado vía repo.save', async () => {
      refreshTokenRepo.findByHash.mockResolvedValue(makeToken({ tokenHash }));

      await useCase.execute({ rawToken });

      expect(refreshTokenRepo.save).toHaveBeenCalledTimes(1);
    });

    it('revocación de un token ya revocado sigue siendo ok (idempotente)', async () => {
      const alreadyRevoked = makeToken({ tokenHash, revokedAt: new Date() });
      refreshTokenRepo.findByHash.mockResolvedValue(alreadyRevoked);

      const result = await useCase.execute({ rawToken });

      expect(result.isOk()).toBe(true);
    });
  });

  describe('Token no existe', () => {
    it('retorna TokenInvalidoError si el token no está en DB', async () => {
      refreshTokenRepo.findByHash.mockResolvedValue(null);

      const result = await useCase.execute({ rawToken });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(TokenInvalidoError);
    });

    it('NO llama a repo.save si el token no existe', async () => {
      refreshTokenRepo.findByHash.mockResolvedValue(null);

      await useCase.execute({ rawToken });

      expect(refreshTokenRepo.save).not.toHaveBeenCalled();
    });
  });
});

// ─── RevocarTodosTokensUsuarioUseCase tests ───────────────────────────────────

describe('RevocarTodosTokensUsuarioUseCase', () => {
  let refreshTokenRepo: jest.Mocked<IRefreshTokenRepository>;
  let useCase: RevocarTodosTokensUsuarioUseCase;

  beforeEach(() => {
    refreshTokenRepo = makeRefreshTokenRepo();
    useCase = new RevocarTodosTokensUsuarioUseCase(refreshTokenRepo);
  });

  it('delega en revokeAllByUsuarioId del repo', async () => {
    const result = await useCase.execute({ usuarioId: 'usuario-uuid' });

    expect(result.isOk()).toBe(true);
    expect(refreshTokenRepo.revokeAllByUsuarioId).toHaveBeenCalledWith('usuario-uuid');
  });

  it('retorna ok aunque el usuario no tenga tokens activos (idempotente)', async () => {
    refreshTokenRepo.revokeAllByUsuarioId.mockResolvedValue(undefined);

    const result = await useCase.execute({ usuarioId: 'usuario-sin-tokens' });

    expect(result.isOk()).toBe(true);
  });

  it('pasa el usuarioId exacto al repo', async () => {
    const specificId = 'specific-user-123';
    await useCase.execute({ usuarioId: specificId });

    expect(refreshTokenRepo.revokeAllByUsuarioId).toHaveBeenCalledWith(specificId);
  });
});
