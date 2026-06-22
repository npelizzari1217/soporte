/**
 * 2.B.3 TEST — Unit tests de RefreshTokenUseCase (RED → GREEN con 2.B.4)
 *
 * Cubre:
 * - Renovación exitosa: revoca token anterior + emite nuevo JWT + nuevo refresh token
 * - Rotación: el token anterior queda revocado; el nuevo token tiene hash SHA-256 correcto
 * - Rechazo si expires_at < now() → TokenExpiradoError
 * - Rechazo si revoked_at IS NOT NULL → TokenRevocadoError
 * - Rechazo si token no existe → TokenInvalidoError
 */
import * as crypto from 'crypto';
import { RefreshTokenUseCase } from './refresh-token.use-case';
import { RefreshTokenEntity } from '../../domain/entities/refresh-token.entity';
import { UsuarioEntity } from '../../domain/entities/usuario.entity';
import { IRefreshTokenRepository } from '../../domain/ports/i-refresh-token.repository';
import { IUsuarioRepository } from '../../domain/ports/i-usuario.repository';
import { ITokenService, JwtPayload } from '../../domain/ports/i-token.service';
import {
  TokenExpiradoError,
  TokenRevocadoError,
  TokenInvalidoError,
} from '../../domain/errors/auth.errors';

// ─── Factories de entidades de test ──────────────────────────────────────────

const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
const past = new Date(Date.now() - 1000);

const makeToken = (
  overrides: Partial<{
    expiresAt: Date;
    revokedAt: Date | null;
    usuarioId: string;
    tokenHash: string;
  }> = {},
): RefreshTokenEntity =>
  RefreshTokenEntity.create({
    usuarioId: overrides.usuarioId ?? 'usuario-uuid',
    tokenHash: overrides.tokenHash ?? 'some-sha256-hash',
    expiresAt: overrides.expiresAt ?? future,
    revokedAt: overrides.revokedAt ?? null,
  });

const makeUsuario = (id?: string): UsuarioEntity =>
  UsuarioEntity.create(
    {
      email: 'user@test.com',
      nombre: 'Juan',
      apellido: 'Perez',
      passwordHash: 'hash',
      clienteId: 'cliente-uuid',
      activo: true,
      roles: [],
    },
    id,
  );

// ─── Mocks de puertos ────────────────────────────────────────────────────────

const makeRefreshTokenRepo = (): jest.Mocked<IRefreshTokenRepository> => ({
  findByHash: jest.fn(),
  revokeAllByUsuarioId: jest.fn().mockResolvedValue(undefined),
  save: jest.fn().mockResolvedValue(undefined),
});

const makeUsuarioRepo = (): jest.Mocked<IUsuarioRepository> => ({
  findByEmail: jest.fn(),
  findById: jest.fn(),
  findByClienteId: jest.fn(),
  save: jest.fn().mockResolvedValue(undefined),
});

const makeTokenService = (): jest.Mocked<ITokenService> => ({
  signJwt: jest.fn().mockReturnValue('new.jwt.token'),
  verifyJwt: jest.fn().mockReturnValue(null),
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('RefreshTokenUseCase', () => {
  let refreshTokenRepo: jest.Mocked<IRefreshTokenRepository>;
  let usuarioRepo: jest.Mocked<IUsuarioRepository>;
  let tokenService: jest.Mocked<ITokenService>;
  let useCase: RefreshTokenUseCase;

  const rawToken = 'a'.repeat(64); // simulated raw token
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

  beforeEach(() => {
    refreshTokenRepo = makeRefreshTokenRepo();
    usuarioRepo = makeUsuarioRepo();
    tokenService = makeTokenService();
    useCase = new RefreshTokenUseCase(refreshTokenRepo, usuarioRepo, tokenService);
  });

  describe('Renovación exitosa (rotación)', () => {
    it('retorna nuevo accessToken y refreshToken', async () => {
      const oldToken = makeToken({ tokenHash });
      refreshTokenRepo.findByHash.mockResolvedValue(oldToken);
      usuarioRepo.findById.mockResolvedValue(makeUsuario());

      const result = await useCase.execute({ rawToken });

      expect(result.isOk()).toBe(true);
      const { accessToken, refreshToken } = result.getValue();
      expect(accessToken).toBeTruthy();
      expect(refreshToken).toBeTruthy();
    });

    it('busca el token por SHA-256(rawToken)', async () => {
      const oldToken = makeToken({ tokenHash });
      refreshTokenRepo.findByHash.mockResolvedValue(oldToken);
      usuarioRepo.findById.mockResolvedValue(makeUsuario());

      await useCase.execute({ rawToken });

      expect(refreshTokenRepo.findByHash).toHaveBeenCalledWith(tokenHash);
    });

    it('revoca el token anterior (rotación)', async () => {
      const oldToken = makeToken({ tokenHash });
      refreshTokenRepo.findByHash.mockResolvedValue(oldToken);
      usuarioRepo.findById.mockResolvedValue(makeUsuario());

      // Capturar las llamadas a save para verificar la revocación
      const savedTokens: RefreshTokenEntity[] = [];
      refreshTokenRepo.save.mockImplementation(async (token) => {
        savedTokens.push(token);
      });

      await useCase.execute({ rawToken });

      // Verificar que el primer save es el token revocado
      const revokedSave = savedTokens.find((t) => t.tokenHash === tokenHash);
      expect(revokedSave).toBeDefined();
      expect(revokedSave!.isRevoked()).toBe(true);
    });

    it('emite un nuevo refresh token (hash SHA-256 distinto al anterior)', async () => {
      const oldToken = makeToken({ tokenHash });
      refreshTokenRepo.findByHash.mockResolvedValue(oldToken);
      usuarioRepo.findById.mockResolvedValue(makeUsuario());

      const result = await useCase.execute({ rawToken });

      const newRawToken = result.getValue().refreshToken;
      const newTokenHash = crypto.createHash('sha256').update(newRawToken).digest('hex');

      // El nuevo hash es diferente al anterior
      expect(newTokenHash).not.toBe(tokenHash);
      // El nuevo token tiene hash SHA-256 (64 chars)
      expect(newTokenHash).toHaveLength(64);
    });

    it('el nuevo refresh token almacenado tiene el hash SHA-256 del rawToken retornado', async () => {
      const oldToken = makeToken({ tokenHash });
      refreshTokenRepo.findByHash.mockResolvedValue(oldToken);
      usuarioRepo.findById.mockResolvedValue(makeUsuario());

      const savedTokens: RefreshTokenEntity[] = [];
      refreshTokenRepo.save.mockImplementation(async (token) => {
        savedTokens.push(token);
      });

      const result = await useCase.execute({ rawToken });
      const newRawToken = result.getValue().refreshToken;

      const newTokenEntity = savedTokens.find((t) => t.tokenHash !== tokenHash && !t.isRevoked());
      expect(newTokenEntity).toBeDefined();
      const expectedHash = crypto.createHash('sha256').update(newRawToken).digest('hex');
      expect(newTokenEntity!.tokenHash).toBe(expectedHash);
    });

    it('firma nuevo JWT para el usuario con sus roles y permisos', async () => {
      const fixedUserId = '01966a6a-0000-7000-8000-000000000099';
      const oldToken = makeToken({ tokenHash, usuarioId: fixedUserId });
      refreshTokenRepo.findByHash.mockResolvedValue(oldToken);
      usuarioRepo.findById.mockResolvedValue(makeUsuario(fixedUserId));

      let capturedPayload: JwtPayload | undefined;
      tokenService.signJwt.mockImplementation((payload) => {
        capturedPayload = payload;
        return 'new.jwt.token';
      });

      await useCase.execute({ rawToken });

      expect(capturedPayload).toBeDefined();
      expect(capturedPayload!.sub).toBe(fixedUserId);
      expect(capturedPayload!.email).toBe('user@test.com');
    });
  });

  describe('Rechazo si token expirado', () => {
    it('retorna TokenExpiradoError si expires_at < now', async () => {
      const expiredToken = makeToken({ tokenHash, expiresAt: past });
      refreshTokenRepo.findByHash.mockResolvedValue(expiredToken);

      const result = await useCase.execute({ rawToken });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(TokenExpiradoError);
    });

    it('NO emite nuevos tokens si el token está expirado', async () => {
      const expiredToken = makeToken({ tokenHash, expiresAt: past });
      refreshTokenRepo.findByHash.mockResolvedValue(expiredToken);

      await useCase.execute({ rawToken });

      expect(tokenService.signJwt).not.toHaveBeenCalled();
      expect(usuarioRepo.findById).not.toHaveBeenCalled();
    });
  });

  describe('Rechazo si token revocado', () => {
    it('retorna TokenRevocadoError si revoked_at IS NOT NULL', async () => {
      const revokedToken = makeToken({ tokenHash, revokedAt: new Date() });
      refreshTokenRepo.findByHash.mockResolvedValue(revokedToken);

      const result = await useCase.execute({ rawToken });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(TokenRevocadoError);
    });

    it('NO emite nuevos tokens si el token está revocado', async () => {
      const revokedToken = makeToken({ tokenHash, revokedAt: new Date() });
      refreshTokenRepo.findByHash.mockResolvedValue(revokedToken);

      await useCase.execute({ rawToken });

      expect(tokenService.signJwt).not.toHaveBeenCalled();
    });
  });

  describe('Rechazo si token no existe', () => {
    it('retorna TokenInvalidoError si el token no está en DB', async () => {
      refreshTokenRepo.findByHash.mockResolvedValue(null);

      const result = await useCase.execute({ rawToken });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(TokenInvalidoError);
    });
  });
});
