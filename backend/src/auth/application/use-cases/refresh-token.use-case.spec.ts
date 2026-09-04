/**
 * T4.1–T4.4 TEST — Unit tests de RefreshTokenUseCase (RED → GREEN)
 *
 * Opción B (decisión #2025, reemplaza ADR-2): el re-scope en refresh NO usa
 * una "pista" `clienteId` provista por el cliente/BFF — se lee directamente
 * de `refreshTokenEntity.clienteId` (el scope con el que el token fue
 * emitido) y se REVALIDA con `resolverScope`, la misma fuente de verdad de
 * autz de tenant que login/switch (root→cualquier cliente vivo; normal→
 * exige membresía activa en ese cliente; `null`→solo válido si root).
 *
 * Cubre (R8):
 * - Token ausente/vacío → TokenInvalido, sin consultar el repo.
 * - Token inexistente → TokenInvalido.
 * - Token expirado → TokenExpirado, sin rotar ni emitir.
 * - Token revocado → TokenRevocado, sin rotar ni emitir.
 * - Feliz: revoca el anterior (rotación), re-valida usuario, re-valida el
 *   scope vía resolverScope con el clienteId embebido, emite nuevo
 *   access+refresh; el nuevo refresh persiste el MISMO clienteId.
 * - Usuario inactivo/soft-deleted desde la emisión → TokenInvalido (el
 *   token ya quedó revocado — rotación incondicional, previene replay).
 * - Cliente inactivo/borrado desde la emisión → ClienteNoAutorizado
 *   (resolverScope, reusado tal cual).
 * - Membresía revocada desde la emisión (normal) → ClienteNoAutorizado.
 * - clienteId embebido null → solo válido si el usuario es root (master).
 * - Payload del nuevo access token incluye membresias[] completo.
 */
import * as crypto from 'crypto';
import type { Mocked } from 'vitest';
import { RefreshTokenUseCase, RefreshTokenDto } from './refresh-token.use-case';
import { RefreshTokenEntity } from '../../domain/entities/refresh-token.entity';
import { UsuarioEntity } from '../../domain/entities/usuario.entity';
import { ClienteEntity } from '../../../clientes/domain/entities/cliente.entity';
import { IRefreshTokenRepository } from '../../domain/ports/i-refresh-token.repository';
import { IUsuarioRepository } from '../../domain/ports/i-usuario.repository';
import { IMembresiaRepository, MembresiaResuelta } from '../../domain/ports/i-membresia.repository';
import { IMatrizPermisosRepository } from '../../domain/ports/i-matriz-permisos.repository';
import { IClienteRepository } from '../../../clientes/domain/ports/i-cliente.repository';
import { ITokenService, JwtPayload } from '../../domain/ports/i-token.service';
import {
  TokenExpiradoError,
  TokenRevocadoError,
  TokenInvalidoError,
  ClienteNoAutorizadoError,
} from '../../domain/errors/auth.errors';
import { PARES_VALIDOS } from '../../../shared/domain/acciones';
import { unstubbed } from '../../../testing/mocks';

// ─── Factories ────────────────────────────────────────────────────────────────

const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
const past = new Date(Date.now() - 1000);

const makeToken = (
  overrides: Partial<{
    expiresAt: Date;
    revokedAt: Date | null;
    usuarioId: string;
    tokenHash: string;
    clienteId: string | null;
  }> = {},
): RefreshTokenEntity =>
  RefreshTokenEntity.create({
    usuarioId: overrides.usuarioId ?? 'usuario-uuid',
    tokenHash: overrides.tokenHash ?? 'some-sha256-hash',
    expiresAt: overrides.expiresAt ?? future,
    revokedAt: overrides.revokedAt ?? null,
    // 'clienteId' in overrides (NO ??): null es un valor explícito válido
    // (scope MASTER) y no debe ser pisado por el default 'cliente-1'.
    clienteId: 'clienteId' in overrides ? (overrides.clienteId as string | null) : 'cliente-1',
  });

const makeUsuario = (
  overrides: Partial<{
    id: string;
    isGlobalAdmin: boolean;
    activo: boolean;
    deletedAt: Date | null;
  }> = {},
): UsuarioEntity => {
  const u = UsuarioEntity.create(
    {
      email: 'user@test.com',
      nombre: 'Juan',
      apellido: 'Perez',
      passwordHash: 'hash',
      activo: overrides.activo ?? true,
      isGlobalAdmin: overrides.isGlobalAdmin ?? false,
    },
    overrides.id,
  );
  if (overrides.deletedAt) {
    (u as unknown as { _deletedAt: Date | null })._deletedAt = overrides.deletedAt;
  }
  return u;
};

const makeCliente = (nombre = 'Acme SA', activo = true): ClienteEntity =>
  ClienteEntity.create({ nombre, razonSocial: null, cuit: null, dbName: 'acme_sa', activo });

/**
 * `MembresiaResuelta` ya NO expone `permisos`: el fix de C2 retiró el campo
 * junto con el JOIN a `roles_permisos` que lo poblaba (saneamiento-tipos-backend
 * WU3). Los permisos del JWT salen de la matriz, no de la membresía.
 */
const makeMembresiaResuelta = (overrides: Partial<MembresiaResuelta> = {}): MembresiaResuelta => ({
  clienteId: 'cliente-1',
  clienteNombre: 'Acme SA',
  rolCodigo: 'TECNICO',
  ...overrides,
});

const makeRefreshTokenRepo = (): Mocked<IRefreshTokenRepository> => ({
  findByHash: vi.fn(),
  revokeAllByUsuarioId: vi.fn().mockResolvedValue(undefined),
  save: vi.fn().mockResolvedValue(undefined),
});

const makeUsuarioRepo = (): Mocked<IUsuarioRepository> => ({
  findByEmail: vi.fn(),
  findById: vi.fn(),
  create: vi.fn(),
  save: vi.fn(),
});

const makeMembresiaRepo = (): Mocked<IMembresiaRepository> => ({
  findActivasByUsuario: vi.fn().mockResolvedValue([]),
  findActivaByUsuarioYCliente: vi.fn(),
  // RefreshTokenUseCase nunca crea/muta membresías, solo las lee vía
  // resolverScope: un stub mudo taparía que producción empiece a llamarlos.
  findActivasByCliente: unstubbed('findActivasByCliente'),
  findByUsuarioYCliente: unstubbed('findByUsuarioYCliente'),
  create: unstubbed('create'),
  save: unstubbed('save'),
});

const makeClienteRepo = (): Mocked<IClienteRepository> => ({
  findById: vi.fn(),
  findByDbName: vi.fn(),
  findAll: vi.fn(),
  save: vi.fn(),
  delete: vi.fn(),
});

const makeTokenService = (): Mocked<ITokenService> => ({
  signJwt: vi.fn().mockReturnValue('new.jwt.token'),
  verifyJwt: vi.fn().mockReturnValue(null),
});

const makePermisosRepo = (): Mocked<IMatrizPermisosRepository> => ({
  findByUsuarioYCliente: vi.fn().mockResolvedValue([]),
  setPermisos: vi.fn().mockResolvedValue(undefined),
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('RefreshTokenUseCase', () => {
  let refreshTokenRepo: Mocked<IRefreshTokenRepository>;
  let usuarioRepo: Mocked<IUsuarioRepository>;
  let membresiaRepo: Mocked<IMembresiaRepository>;
  let clienteRepo: Mocked<IClienteRepository>;
  let tokenService: Mocked<ITokenService>;
  let permisosRepo: Mocked<IMatrizPermisosRepository>;
  let useCase: RefreshTokenUseCase;

  const rawToken = 'a'.repeat(64);
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

  beforeEach(() => {
    refreshTokenRepo = makeRefreshTokenRepo();
    usuarioRepo = makeUsuarioRepo();
    membresiaRepo = makeMembresiaRepo();
    clienteRepo = makeClienteRepo();
    tokenService = makeTokenService();
    permisosRepo = makePermisosRepo();
    useCase = new RefreshTokenUseCase(
      refreshTokenRepo,
      usuarioRepo,
      membresiaRepo,
      clienteRepo,
      tokenService,
      permisosRepo,
    );
  });

  // ─── T4.1 — token ausente/inexistente/expirado/revocado (R8) ──────────────

  describe('Rechazo si rawToken ausente o vacío', () => {
    it('retorna TokenInvalido sin crashear', async () => {
      const dto: RefreshTokenDto = { rawToken: undefined as unknown as string };

      const result = await useCase.execute(dto);

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(TokenInvalidoError);
    });

    it('short-circuit: no consulta el repo', async () => {
      await useCase.execute({ rawToken: '' });

      expect(refreshTokenRepo.findByHash).not.toHaveBeenCalled();
    });
  });

  describe('Rechazo si el token no existe', () => {
    it('retorna TokenInvalido', async () => {
      refreshTokenRepo.findByHash.mockResolvedValue(null);

      const result = await useCase.execute({ rawToken });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(TokenInvalidoError);
    });
  });

  describe('Rechazo si el token está expirado', () => {
    it('retorna TokenExpirado y NO rota ni emite', async () => {
      refreshTokenRepo.findByHash.mockResolvedValue(makeToken({ tokenHash, expiresAt: past }));

      const result = await useCase.execute({ rawToken });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(TokenExpiradoError);
      expect(refreshTokenRepo.save).not.toHaveBeenCalled();
      expect(tokenService.signJwt).not.toHaveBeenCalled();
    });
  });

  describe('Rechazo si el token está revocado', () => {
    it('retorna TokenRevocado y NO emite', async () => {
      refreshTokenRepo.findByHash.mockResolvedValue(
        makeToken({ tokenHash, revokedAt: new Date() }),
      );

      const result = await useCase.execute({ rawToken });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(TokenRevocadoError);
      expect(tokenService.signJwt).not.toHaveBeenCalled();
    });
  });

  // ─── T4.2 — refresh feliz: rotación + re-scope + nuevo access/refresh ─────

  describe('Refresh feliz (normal, clienteId embebido)', () => {
    const setupHappyPath = () => {
      const oldToken = makeToken({ tokenHash, usuarioId: 'usuario-1', clienteId: 'cliente-1' });
      refreshTokenRepo.findByHash.mockResolvedValue(oldToken);
      usuarioRepo.findById.mockResolvedValue(makeUsuario({ id: 'usuario-1' }));
      clienteRepo.findById.mockResolvedValue(makeCliente());
      const membresia = makeMembresiaResuelta({ clienteId: 'cliente-1' });
      membresiaRepo.findActivaByUsuarioYCliente.mockResolvedValue(membresia);
      membresiaRepo.findActivasByUsuario.mockResolvedValue([membresia]);
      return oldToken;
    };

    it('revoca el token anterior (rotación)', async () => {
      setupHappyPath();
      const savedTokens: RefreshTokenEntity[] = [];
      refreshTokenRepo.save.mockImplementation(async (t) => {
        savedTokens.push(t);
      });

      await useCase.execute({ rawToken });

      const revoked = savedTokens.find((t) => t.tokenHash === tokenHash);
      expect(revoked?.isRevoked()).toBe(true);
    });

    it('emite un nuevo accessToken y refreshToken', async () => {
      setupHappyPath();

      const result = await useCase.execute({ rawToken });

      expect(result.isOk()).toBe(true);
      const { accessToken, refreshToken } = result.getValue();
      expect(accessToken).toBeTruthy();
      expect(refreshToken).toBeTruthy();
      expect(refreshToken).not.toBe(rawToken);
    });

    it('el nuevo refresh token persistido conserva el MISMO clienteId (Opción B)', async () => {
      setupHappyPath();
      const savedTokens: RefreshTokenEntity[] = [];
      refreshTokenRepo.save.mockImplementation(async (t) => {
        savedTokens.push(t);
      });

      await useCase.execute({ rawToken });

      const nuevo = savedTokens.find((t) => t.tokenHash !== tokenHash);
      expect(nuevo?.clienteId).toBe('cliente-1');
    });

    it('firma el nuevo JWT scopeado al clienteId embebido, con membresias[] completo', async () => {
      setupHappyPath();
      let captured: JwtPayload | undefined;
      tokenService.signJwt.mockImplementation((p) => {
        captured = p;
        return 'new.jwt.token';
      });

      await useCase.execute({ rawToken });

      expect(captured!.cliente_id).toBe('cliente-1');
      expect(captured!.rol).toBe('TECNICO');
      expect(captured!.membresias).toEqual([
        { cliente_id: 'cliente-1', nombre: 'Acme SA', rol: 'TECNICO' },
      ]);
    });

    it('el nuevo payload incluye nombre/apellido de la UsuarioEntity recargada', async () => {
      setupHappyPath();
      let captured: JwtPayload | undefined;
      tokenService.signJwt.mockImplementation((p) => {
        captured = p;
        return 'new.jwt.token';
      });

      await useCase.execute({ rawToken });

      expect(captured!.nombre).toBe('Juan');
      expect(captured!.apellido).toBe('Perez');
    });
  });

  describe('Refresh feliz (root, clienteId embebido null → token master)', () => {
    it('emite token master (cliente_id/rol null, permisos = bypass total — WU-7.1)', async () => {
      const oldToken = makeToken({ tokenHash, usuarioId: 'root-1', clienteId: null });
      refreshTokenRepo.findByHash.mockResolvedValue(oldToken);
      usuarioRepo.findById.mockResolvedValue(makeUsuario({ id: 'root-1', isGlobalAdmin: true }));
      membresiaRepo.findActivasByUsuario.mockResolvedValue([]);

      let captured: JwtPayload | undefined;
      tokenService.signJwt.mockImplementation((p) => {
        captured = p;
        return 'new.jwt.token';
      });

      const result = await useCase.execute({ rawToken });

      expect(result.isOk()).toBe(true);
      expect(captured!.cliente_id).toBeNull();
      expect(captured!.rol).toBeNull();
      expect(captured!.permisos).toEqual([...PARES_VALIDOS]);
      expect(clienteRepo.findById).not.toHaveBeenCalled();
    });
  });

  // ─── T4.3 — re-scope revalidado vía resolverScope ──────────────────────────

  describe('Rechazo: usuario inactivo/soft-deleted desde la emisión', () => {
    it('retorna TokenInvalido (el token ya fue revocado — no hay replay)', async () => {
      const oldToken = makeToken({ tokenHash, usuarioId: 'usuario-1' });
      refreshTokenRepo.findByHash.mockResolvedValue(oldToken);
      usuarioRepo.findById.mockResolvedValue(makeUsuario({ id: 'usuario-1', activo: false }));

      const result = await useCase.execute({ rawToken });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(TokenInvalidoError);
      expect(tokenService.signJwt).not.toHaveBeenCalled();
      // Rotación incondicional: el token viejo YA quedó revocado antes de la re-validación.
      expect(refreshTokenRepo.save).toHaveBeenCalledTimes(1);
      expect(oldToken.isRevoked()).toBe(true);
    });
  });

  describe('Rechazo: cliente inactivo/borrado desde la emisión (resolverScope)', () => {
    it('retorna ClienteNoAutorizado', async () => {
      const oldToken = makeToken({ tokenHash, usuarioId: 'usuario-1', clienteId: 'cliente-1' });
      refreshTokenRepo.findByHash.mockResolvedValue(oldToken);
      usuarioRepo.findById.mockResolvedValue(makeUsuario({ id: 'usuario-1' }));
      clienteRepo.findById.mockResolvedValue(makeCliente('Acme SA', false));

      const result = await useCase.execute({ rawToken });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(ClienteNoAutorizadoError);
      expect(tokenService.signJwt).not.toHaveBeenCalled();
    });
  });

  describe('Rechazo: membresía revocada desde la emisión (normal, resolverScope)', () => {
    it('retorna ClienteNoAutorizado', async () => {
      const oldToken = makeToken({ tokenHash, usuarioId: 'usuario-1', clienteId: 'cliente-1' });
      refreshTokenRepo.findByHash.mockResolvedValue(oldToken);
      usuarioRepo.findById.mockResolvedValue(makeUsuario({ id: 'usuario-1' }));
      clienteRepo.findById.mockResolvedValue(makeCliente());
      membresiaRepo.findActivaByUsuarioYCliente.mockResolvedValue(null);

      const result = await useCase.execute({ rawToken });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(ClienteNoAutorizadoError);
      expect(tokenService.signJwt).not.toHaveBeenCalled();
    });
  });

  describe('Rechazo: clienteId embebido null pero el usuario ya no es root', () => {
    it('retorna ClienteNoAutorizado (resolverScope: null solo válido para root)', async () => {
      const oldToken = makeToken({ tokenHash, usuarioId: 'usuario-1', clienteId: null });
      refreshTokenRepo.findByHash.mockResolvedValue(oldToken);
      usuarioRepo.findById.mockResolvedValue(
        makeUsuario({ id: 'usuario-1', isGlobalAdmin: false }),
      );

      const result = await useCase.execute({ rawToken });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(ClienteNoAutorizadoError);
    });
  });
});
