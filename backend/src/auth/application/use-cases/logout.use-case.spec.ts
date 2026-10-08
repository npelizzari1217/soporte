/**
 * T4.5 TEST — Unit tests de LogoutUseCase y LogoutAllUseCase (RED → GREEN)
 *
 * LogoutUseCase (revoca el refresh token actual — logout de un dispositivo):
 * - Revocación exitosa: setea revoked_at.
 * - Token no existe → TokenInvalidoError.
 * - Idempotente: revocar un token ya revocado sigue siendo ok.
 *
 * LogoutAllUseCase (revoca TODOS los refresh tokens del usuario, R9):
 * - Delega en revokeAllByUsuarioId del repo.
 * - Idempotente si el usuario no tiene tokens activos.
 */
import * as crypto from 'crypto';
import type { Mocked } from 'vitest';
import { LogoutUseCase } from './logout.use-case';
import { LogoutAllUseCase } from './logout-all.use-case';
import { RefreshTokenEntity } from '../../domain/entities/refresh-token.entity';
import { IRefreshTokenRepository } from '../../domain/ports/i-refresh-token.repository';
import { IDispositivoConfiableRepository } from '../../domain/ports/dispositivo-confiable-repository.port';
import { unstubbed } from '../../../testing/mocks';
import { TokenInvalidoError } from '../../domain/errors/auth.errors';

const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

const makeToken = (
  overrides: Partial<{ revokedAt: Date | null; tokenHash: string; clienteId: string | null }> = {},
): RefreshTokenEntity =>
  RefreshTokenEntity.create({
    usuarioId: 'usuario-uuid',
    tokenHash: overrides.tokenHash ?? 'sha256hash',
    expiresAt: future,
    revokedAt: overrides.revokedAt ?? null,
    clienteId: overrides.clienteId ?? 'cliente-1',
  });

const makeRefreshTokenRepo = (): Mocked<IRefreshTokenRepository> => ({
  findByHash: vi.fn(),
  revokeAllByUsuarioId: vi.fn().mockResolvedValue(undefined),
  save: vi.fn().mockResolvedValue(undefined),
});

describe('LogoutUseCase', () => {
  let refreshTokenRepo: Mocked<IRefreshTokenRepository>;
  let useCase: LogoutUseCase;

  const rawToken = 'b'.repeat(64);
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

  beforeEach(() => {
    refreshTokenRepo = makeRefreshTokenRepo();
    useCase = new LogoutUseCase(refreshTokenRepo);
  });

  describe('Revocación exitosa', () => {
    it('retorna ok cuando el token existe', async () => {
      refreshTokenRepo.findByHash.mockResolvedValue(makeToken({ tokenHash }));

      const result = await useCase.execute({ rawToken });

      expect(result.isOk()).toBe(true);
    });

    it('setea revoked_at en el token', async () => {
      refreshTokenRepo.findByHash.mockResolvedValue(makeToken({ tokenHash }));
      let saved: RefreshTokenEntity | undefined;
      refreshTokenRepo.save.mockImplementation(async (t) => {
        saved = t;
      });

      await useCase.execute({ rawToken });

      expect(saved!.isRevoked()).toBe(true);
    });

    it('busca el token por SHA-256(rawToken)', async () => {
      refreshTokenRepo.findByHash.mockResolvedValue(makeToken({ tokenHash }));

      await useCase.execute({ rawToken });

      expect(refreshTokenRepo.findByHash).toHaveBeenCalledWith(tokenHash);
    });

    it('revocar un token ya revocado sigue siendo ok (idempotente)', async () => {
      refreshTokenRepo.findByHash.mockResolvedValue(
        makeToken({ tokenHash, revokedAt: new Date() }),
      );

      const result = await useCase.execute({ rawToken });

      expect(result.isOk()).toBe(true);
    });
  });

  describe('Token no existe', () => {
    it('retorna TokenInvalido', async () => {
      refreshTokenRepo.findByHash.mockResolvedValue(null);

      const result = await useCase.execute({ rawToken });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(TokenInvalidoError);
    });

    it('NO llama a repo.save', async () => {
      refreshTokenRepo.findByHash.mockResolvedValue(null);

      await useCase.execute({ rawToken });

      expect(refreshTokenRepo.save).not.toHaveBeenCalled();
    });
  });
});

describe('LogoutAllUseCase', () => {
  let refreshTokenRepo: Mocked<IRefreshTokenRepository>;
  const dispositivos = {
    crear: unstubbed('crear'),
    esValido: unstubbed('esValido'),
    renovar: unstubbed('renovar'),
    revocarTodosDe: vi.fn(),
  } satisfies IDispositivoConfiableRepository;
  let useCase: LogoutAllUseCase;

  beforeEach(() => {
    refreshTokenRepo = makeRefreshTokenRepo();
    dispositivos.revocarTodosDe.mockReset().mockResolvedValue(undefined);
    useCase = new LogoutAllUseCase(refreshTokenRepo, dispositivos);
  });

  it('revoca todos los dispositivos confiables del usuario (el codigo se pide de nuevo en todos lados)', async () => {
    await useCase.execute({ usuarioId: 'usuario-uuid' });

    expect(dispositivos.revocarTodosDe).toHaveBeenCalledWith('usuario-uuid');
  });

  it('es fail-closed: si la revocacion de dispositivos falla, propaga el error', async () => {
    dispositivos.revocarTodosDe.mockRejectedValue(new Error('db caida'));

    await expect(useCase.execute({ usuarioId: 'usuario-uuid' })).rejects.toThrow('db caida');
  });

  it('delega en revokeAllByUsuarioId del repo', async () => {
    const result = await useCase.execute({ usuarioId: 'usuario-uuid' });

    expect(result.isOk()).toBe(true);
    expect(refreshTokenRepo.revokeAllByUsuarioId).toHaveBeenCalledWith('usuario-uuid');
  });

  it('retorna ok aunque el usuario no tenga tokens activos (idempotente)', async () => {
    const result = await useCase.execute({ usuarioId: 'usuario-sin-tokens' });

    expect(result.isOk()).toBe(true);
  });
});
