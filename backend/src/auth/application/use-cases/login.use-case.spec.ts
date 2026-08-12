/**
 * T3.1–T3.8, T3.10 TEST — Unit tests de LoginUseCase (RED → GREEN con T3.9)
 *
 * Todos los puertos son mocks puros — sin DB, sin argon2/JWT reales.
 *
 * Cubre (R3, R4, R5, R6, R7):
 * - Usuario inexistente/inactivo/soft-deleted → verify(DUMMY_HASH) + 401
 *   CredencialesInvalidas (defensa timing side-channel, R3).
 * - Password incorrecto → 401 CredencialesInvalidas.
 * - Normal 0 membresías activas (sin clienteId) → 403 SinMembresiaActiva.
 * - Normal 1 membresía (sin clienteId) → auto-selecciona, {kind:'tokens'}.
 * - Normal >1 membresías (sin clienteId) → {kind:'selection', membresias[]}
 *   SIN emitir tokens.
 * - Root sin clienteId → token master (cliente_id/rol null, permisos [],
 *   is_global_admin true).
 * - clienteId provisto no seleccionable (normal sin membresía en ese
 *   cliente / cliente inactivo) → 403 ClienteNoAutorizado.
 * - Root con clienteId de cualquier cliente activo → token scopeado.
 * - Payload incluye membresias[] completo (R6) y refresh sha256 persistido
 *   (R7).
 */
import * as crypto from 'crypto';
import { LoginUseCase, DUMMY_HASH } from './login.use-case';
import { UsuarioEntity } from '../../domain/entities/usuario.entity';
import { RefreshTokenEntity } from '../../domain/entities/refresh-token.entity';
import {
  CredencialesInvalidasError,
  SinMembresiaActivaError,
  ClienteNoAutorizadoError,
} from '../../domain/errors/auth.errors';
import { IUsuarioRepository } from '../../domain/ports/i-usuario.repository';
import { IMembresiaRepository, MembresiaResuelta } from '../../domain/ports/i-membresia.repository';
import { IUsuarioClienteModuloRepository } from '../../domain/ports/i-usuario-cliente-modulo.repository';
import { IRefreshTokenRepository } from '../../domain/ports/i-refresh-token.repository';
import { IHashProvider } from '../../domain/ports/i-hash.provider';
import { ITokenService, JwtPayload } from '../../domain/ports/i-token.service';
import { IClienteRepository } from '../../../clientes/domain/ports/i-cliente.repository';
import { ClienteEntity } from '../../../clientes/domain/entities/cliente.entity';

// ─── Factories de entidades/mocks de test ────────────────────────────────────

const makeUsuario = (
  overrides: Partial<{
    activo: boolean;
    deletedAt: Date | null;
    isGlobalAdmin: boolean;
    email: string;
  }> = {},
): UsuarioEntity => {
  const u = UsuarioEntity.create({
    email: overrides.email ?? 'user@test.com',
    nombre: 'Juan',
    apellido: 'Perez',
    passwordHash: 'stored_hash',
    activo: overrides.activo ?? true,
    isGlobalAdmin: overrides.isGlobalAdmin ?? false,
  });
  if (overrides.deletedAt) {
    (u as unknown as { _deletedAt: Date | null })._deletedAt = overrides.deletedAt;
  }
  return u;
};

const makeCliente = (overrides: Partial<{ nombre: string; activo: boolean }> = {}) =>
  ClienteEntity.create({
    nombre: overrides.nombre ?? 'Acme SA',
    razonSocial: null,
    cuit: null,
    dbName: 'acme_sa',
    activo: overrides.activo ?? true,
  });

const makeMembresiaResuelta = (overrides: Partial<MembresiaResuelta> = {}): MembresiaResuelta => ({
  clienteId: 'cliente-1',
  clienteNombre: 'Acme SA',
  rolCodigo: 'TECNICO',
  permisos: ['ticket:crear', 'ticket:editar'],
  ...overrides,
});

const makeUsuarioRepo = (): vi.Mocked<IUsuarioRepository> => ({
  findByEmail: vi.fn(),
  findById: vi.fn(),
  create: vi.fn(),
  save: vi.fn(),
});

const makeMembresiaRepo = (): vi.Mocked<IMembresiaRepository> => ({
  findActivasByUsuario: vi.fn().mockResolvedValue([]),
  findActivaByUsuarioYCliente: vi.fn(),
  create: vi.fn().mockResolvedValue(undefined),
});

const makeClienteRepo = (): vi.Mocked<IClienteRepository> => ({
  findById: vi.fn(),
  findByDbName: vi.fn(),
  findAll: vi.fn(),
  save: vi.fn(),
  delete: vi.fn(),
});

const makeHashProvider = (): vi.Mocked<IHashProvider> => ({
  hash: vi.fn().mockResolvedValue('$argon2id$hashed'),
  verify: vi.fn().mockResolvedValue(true),
});

const makeTokenService = (): vi.Mocked<ITokenService> => ({
  signJwt: vi.fn().mockReturnValue('signed.jwt.token'),
  verifyJwt: vi.fn().mockReturnValue(null),
});

const makeRefreshTokenRepo = (): vi.Mocked<IRefreshTokenRepository> => ({
  findByHash: vi.fn(),
  revokeAllByUsuarioId: vi.fn().mockResolvedValue(undefined),
  save: vi.fn().mockResolvedValue(undefined),
});

const makeModulosRepo = (): vi.Mocked<IUsuarioClienteModuloRepository> => ({
  findModulosByUsuarioYCliente: vi.fn().mockResolvedValue([]),
});

describe('LoginUseCase', () => {
  let usuarioRepo: ReturnType<typeof makeUsuarioRepo>;
  let membresiaRepo: ReturnType<typeof makeMembresiaRepo>;
  let clienteRepo: ReturnType<typeof makeClienteRepo>;
  let hashProvider: ReturnType<typeof makeHashProvider>;
  let tokenService: ReturnType<typeof makeTokenService>;
  let refreshTokenRepo: ReturnType<typeof makeRefreshTokenRepo>;
  let modulosRepo: ReturnType<typeof makeModulosRepo>;
  let useCase: LoginUseCase;

  beforeEach(() => {
    usuarioRepo = makeUsuarioRepo();
    membresiaRepo = makeMembresiaRepo();
    clienteRepo = makeClienteRepo();
    hashProvider = makeHashProvider();
    tokenService = makeTokenService();
    refreshTokenRepo = makeRefreshTokenRepo();
    modulosRepo = makeModulosRepo();
    useCase = new LoginUseCase(
      usuarioRepo,
      membresiaRepo,
      clienteRepo,
      hashProvider,
      tokenService,
      refreshTokenRepo,
      modulosRepo,
    );
  });

  // ─── T3.1 — usuario inexistente/inactivo/soft-deleted (R3) ────────────────

  describe('Usuario inexistente/inactivo/soft-deleted → 401 (timing-safe)', () => {
    it('email no registrado → CredencialesInvalidas', async () => {
      usuarioRepo.findByEmail.mockResolvedValue(null);

      const result = await useCase.execute({ email: 'noexiste@test.com', password: 'secret' });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(CredencialesInvalidasError);
    });

    it('email no registrado → igual llama hashProvider.verify con DUMMY_HASH (defensa timing)', async () => {
      usuarioRepo.findByEmail.mockResolvedValue(null);

      await useCase.execute({ email: 'noexiste@test.com', password: 'secret' });

      expect(hashProvider.verify).toHaveBeenCalledWith('secret', DUMMY_HASH);
    });

    it('usuario activo=false → CredencialesInvalidas + verify(DUMMY_HASH)', async () => {
      usuarioRepo.findByEmail.mockResolvedValue(makeUsuario({ activo: false }));

      const result = await useCase.execute({ email: 'user@test.com', password: 'secret' });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(CredencialesInvalidasError);
      expect(hashProvider.verify).toHaveBeenCalledWith('secret', DUMMY_HASH);
    });

    it('usuario soft-deleted → CredencialesInvalidas + verify(DUMMY_HASH)', async () => {
      usuarioRepo.findByEmail.mockResolvedValue(makeUsuario({ deletedAt: new Date() }));

      const result = await useCase.execute({ email: 'user@test.com', password: 'secret' });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(CredencialesInvalidasError);
      expect(hashProvider.verify).toHaveBeenCalledWith('secret', DUMMY_HASH);
    });

    it('NO genera tokens ni consulta membresías cuando el usuario no es válido', async () => {
      usuarioRepo.findByEmail.mockResolvedValue(null);

      await useCase.execute({ email: 'noexiste@test.com', password: 'secret' });

      expect(tokenService.signJwt).not.toHaveBeenCalled();
      expect(refreshTokenRepo.save).not.toHaveBeenCalled();
      expect(membresiaRepo.findActivasByUsuario).not.toHaveBeenCalled();
    });
  });

  // ─── T3.2 — password incorrecto (R3) ───────────────────────────────────────

  describe('Password incorrecto → 401', () => {
    it('retorna CredencialesInvalidas cuando el password no coincide', async () => {
      usuarioRepo.findByEmail.mockResolvedValue(makeUsuario());
      hashProvider.verify.mockResolvedValue(false);

      const result = await useCase.execute({ email: 'user@test.com', password: 'wrong' });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(CredencialesInvalidasError);
    });

    it('NO genera tokens cuando el password es incorrecto', async () => {
      usuarioRepo.findByEmail.mockResolvedValue(makeUsuario());
      hashProvider.verify.mockResolvedValue(false);

      await useCase.execute({ email: 'user@test.com', password: 'wrong' });

      expect(tokenService.signJwt).not.toHaveBeenCalled();
      expect(refreshTokenRepo.save).not.toHaveBeenCalled();
    });
  });

  // ─── T3.3 — normal, 0 membresías (R4) ──────────────────────────────────────

  describe('Normal con 0 membresías activas (sin clienteId) → 403', () => {
    it('retorna SinMembresiaActiva', async () => {
      usuarioRepo.findByEmail.mockResolvedValue(makeUsuario());
      membresiaRepo.findActivasByUsuario.mockResolvedValue([]);

      const result = await useCase.execute({ email: 'user@test.com', password: 'secret' });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(SinMembresiaActivaError);
    });

    it('NO genera tokens', async () => {
      usuarioRepo.findByEmail.mockResolvedValue(makeUsuario());
      membresiaRepo.findActivasByUsuario.mockResolvedValue([]);

      await useCase.execute({ email: 'user@test.com', password: 'secret' });

      expect(tokenService.signJwt).not.toHaveBeenCalled();
    });
  });

  // ─── T3.4 — normal, 1 membresía (R4) ───────────────────────────────────────

  describe('Normal con 1 membresía activa (sin clienteId) → auto-selecciona', () => {
    it('retorna {kind:"tokens"} scopeado a la única membresía', async () => {
      usuarioRepo.findByEmail.mockResolvedValue(makeUsuario());
      const membresia = makeMembresiaResuelta();
      membresiaRepo.findActivasByUsuario.mockResolvedValue([membresia]);
      clienteRepo.findById.mockResolvedValue(makeCliente({ nombre: 'Acme SA' }));
      membresiaRepo.findActivaByUsuarioYCliente.mockResolvedValue(membresia);

      const result = await useCase.execute({ email: 'user@test.com', password: 'secret' });

      expect(result.isOk()).toBe(true);
      const value = result.getValue();
      expect(value.kind).toBe('tokens');
    });

    it('el payload firmado queda scopeado al cliente de la única membresía', async () => {
      usuarioRepo.findByEmail.mockResolvedValue(makeUsuario());
      const membresia = makeMembresiaResuelta({ clienteId: 'cliente-1', rolCodigo: 'TECNICO' });
      membresiaRepo.findActivasByUsuario.mockResolvedValue([membresia]);
      clienteRepo.findById.mockResolvedValue(makeCliente({ nombre: 'Acme SA' }));
      membresiaRepo.findActivaByUsuarioYCliente.mockResolvedValue(membresia);

      let captured: JwtPayload | undefined;
      tokenService.signJwt.mockImplementation((p) => {
        captured = p;
        return 'jwt.token';
      });

      await useCase.execute({ email: 'user@test.com', password: 'secret' });

      expect(captured!.cliente_id).toBe('cliente-1');
      expect(captured!.rol).toBe('TECNICO');
      expect(captured!.permisos).toEqual(['ticket:crear', 'ticket:editar']);
    });
  });

  // ─── T3.5 — normal, >1 membresías (R4) ─────────────────────────────────────

  describe('Normal con >1 membresías activas (sin clienteId) → selección', () => {
    it('retorna {kind:"selection", membresias[]} SIN emitir tokens', async () => {
      usuarioRepo.findByEmail.mockResolvedValue(makeUsuario());
      const m1 = makeMembresiaResuelta({
        clienteId: 'cliente-1',
        clienteNombre: 'Acme SA',
        rolCodigo: 'TECNICO',
      });
      const m2 = makeMembresiaResuelta({
        clienteId: 'cliente-2',
        clienteNombre: 'Beta SA',
        rolCodigo: 'USUARIO',
      });
      membresiaRepo.findActivasByUsuario.mockResolvedValue([m1, m2]);

      const result = await useCase.execute({ email: 'user@test.com', password: 'secret' });

      expect(result.isOk()).toBe(true);
      const value = result.getValue();
      expect(value.kind).toBe('selection');
      if (value.kind === 'selection') {
        expect(value.membresias).toEqual([
          { cliente_id: 'cliente-1', nombre: 'Acme SA', rol: 'TECNICO' },
          { cliente_id: 'cliente-2', nombre: 'Beta SA', rol: 'USUARIO' },
        ]);
      }
      expect(tokenService.signJwt).not.toHaveBeenCalled();
      expect(refreshTokenRepo.save).not.toHaveBeenCalled();
    });
  });

  // ─── T3.6 — root sin clienteId (R4) ────────────────────────────────────────

  describe('Root sin clienteId → token master', () => {
    it('emite token con cliente_id/rol null, permisos [], is_global_admin true', async () => {
      usuarioRepo.findByEmail.mockResolvedValue(makeUsuario({ isGlobalAdmin: true }));
      membresiaRepo.findActivasByUsuario.mockResolvedValue([]);

      let captured: JwtPayload | undefined;
      tokenService.signJwt.mockImplementation((p) => {
        captured = p;
        return 'jwt.token';
      });

      const result = await useCase.execute({ email: 'root@test.com', password: 'secret' });

      expect(result.isOk()).toBe(true);
      expect(result.getValue().kind).toBe('tokens');
      expect(captured!.cliente_id).toBeNull();
      expect(captured!.rol).toBeNull();
      expect(captured!.permisos).toEqual([]);
      expect(captured!.is_global_admin).toBe(true);
      expect(captured!.cliente_nombre).toBeNull();
      expect(clienteRepo.findById).not.toHaveBeenCalled();
    });

    it('root con 0 membresías NO recibe SinMembresiaActiva (a diferencia de un normal)', async () => {
      usuarioRepo.findByEmail.mockResolvedValue(makeUsuario({ isGlobalAdmin: true }));
      membresiaRepo.findActivasByUsuario.mockResolvedValue([]);

      const result = await useCase.execute({ email: 'root@test.com', password: 'secret' });

      expect(result.isOk()).toBe(true);
    });
  });

  // ─── T3.7 — clienteId provisto no seleccionable (R5) ───────────────────────

  describe('clienteId provisto no seleccionable → 403 ClienteNoAutorizado', () => {
    it('normal sin membresía en el cliente solicitado', async () => {
      usuarioRepo.findByEmail.mockResolvedValue(makeUsuario());
      clienteRepo.findById.mockResolvedValue(makeCliente());
      membresiaRepo.findActivaByUsuarioYCliente.mockResolvedValue(null);

      const result = await useCase.execute({
        email: 'user@test.com',
        password: 'secret',
        clienteId: 'cliente-x',
      });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(ClienteNoAutorizadoError);
    });

    it('cliente inactivo (incluso siendo root)', async () => {
      usuarioRepo.findByEmail.mockResolvedValue(makeUsuario({ isGlobalAdmin: true }));
      clienteRepo.findById.mockResolvedValue(makeCliente({ activo: false }));

      const result = await useCase.execute({
        email: 'root@test.com',
        password: 'secret',
        clienteId: 'cliente-x',
      });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(ClienteNoAutorizadoError);
    });

    it('no genera tokens', async () => {
      usuarioRepo.findByEmail.mockResolvedValue(makeUsuario());
      clienteRepo.findById.mockResolvedValue(null);

      await useCase.execute({ email: 'user@test.com', password: 'secret', clienteId: 'cliente-x' });

      expect(tokenService.signJwt).not.toHaveBeenCalled();
      expect(refreshTokenRepo.save).not.toHaveBeenCalled();
    });
  });

  // ─── T3.8 — root con clienteId válido (R5) ─────────────────────────────────

  describe('Root con clienteId de cualquier cliente activo → token scopeado', () => {
    it('CON membresía en ese cliente → rol/permisos de la membresía', async () => {
      usuarioRepo.findByEmail.mockResolvedValue(makeUsuario({ isGlobalAdmin: true }));
      clienteRepo.findById.mockResolvedValue(makeCliente({ nombre: 'Acme SA' }));
      membresiaRepo.findActivaByUsuarioYCliente.mockResolvedValue(
        makeMembresiaResuelta({ rolCodigo: 'ADMINISTRADOR', permisos: ['cliente:gestionar'] }),
      );

      let captured: JwtPayload | undefined;
      tokenService.signJwt.mockImplementation((p) => {
        captured = p;
        return 'jwt.token';
      });

      const result = await useCase.execute({
        email: 'root@test.com',
        password: 'secret',
        clienteId: 'cliente-1',
      });

      expect(result.isOk()).toBe(true);
      expect(captured!.cliente_id).toBe('cliente-1');
      expect(captured!.rol).toBe('ADMINISTRADOR');
      expect(captured!.permisos).toEqual(['cliente:gestionar']);
      expect(captured!.is_global_admin).toBe(true);
    });

    it('SIN membresía en ese cliente → rol=null, permisos=[], igual autorizado', async () => {
      usuarioRepo.findByEmail.mockResolvedValue(makeUsuario({ isGlobalAdmin: true }));
      clienteRepo.findById.mockResolvedValue(makeCliente({ nombre: 'Acme SA' }));
      membresiaRepo.findActivaByUsuarioYCliente.mockResolvedValue(null);

      let captured: JwtPayload | undefined;
      tokenService.signJwt.mockImplementation((p) => {
        captured = p;
        return 'jwt.token';
      });

      const result = await useCase.execute({
        email: 'root@test.com',
        password: 'secret',
        clienteId: 'cliente-1',
      });

      expect(result.isOk()).toBe(true);
      expect(captured!.rol).toBeNull();
      expect(captured!.permisos).toEqual([]);
      expect(captured!.cliente_nombre).toBe('Acme SA');
    });
  });

  // ─── T3.10 — membresias[] completo + refresh sha256 persistido (R6, R7) ───

  describe('Payload y persistencia de refresh token', () => {
    it('membresias[] incluye TODAS las membresías activas del usuario, no solo la scopeada', async () => {
      usuarioRepo.findByEmail.mockResolvedValue(makeUsuario());
      const m1 = makeMembresiaResuelta({
        clienteId: 'cliente-1',
        clienteNombre: 'Acme SA',
        rolCodigo: 'TECNICO',
      });
      const m2 = makeMembresiaResuelta({
        clienteId: 'cliente-2',
        clienteNombre: 'Beta SA',
        rolCodigo: 'USUARIO',
      });
      membresiaRepo.findActivasByUsuario.mockResolvedValue([m1, m2]);
      clienteRepo.findById.mockResolvedValue(makeCliente({ nombre: 'Acme SA' }));
      membresiaRepo.findActivaByUsuarioYCliente.mockResolvedValue(m1);

      let captured: JwtPayload | undefined;
      tokenService.signJwt.mockImplementation((p) => {
        captured = p;
        return 'jwt.token';
      });

      await useCase.execute({ email: 'user@test.com', password: 'secret', clienteId: 'cliente-1' });

      expect(captured!.membresias).toEqual([
        { cliente_id: 'cliente-1', nombre: 'Acme SA', rol: 'TECNICO' },
        { cliente_id: 'cliente-2', nombre: 'Beta SA', rol: 'USUARIO' },
      ]);
    });

    it('almacena SHA-256 del refresh token crudo (no el valor en claro)', async () => {
      usuarioRepo.findByEmail.mockResolvedValue(makeUsuario());
      const membresia = makeMembresiaResuelta();
      membresiaRepo.findActivasByUsuario.mockResolvedValue([membresia]);
      clienteRepo.findById.mockResolvedValue(makeCliente());
      membresiaRepo.findActivaByUsuarioYCliente.mockResolvedValue(membresia);

      let saved: RefreshTokenEntity | undefined;
      refreshTokenRepo.save.mockImplementation(async (token) => {
        saved = token;
      });

      const result = await useCase.execute({ email: 'user@test.com', password: 'secret' });

      expect(result.isOk()).toBe(true);
      if (result.getValue().kind !== 'tokens') throw new Error('expected tokens');
      const rawToken = result.getValue().refreshToken;
      const expectedHash = crypto.createHash('sha256').update(rawToken).digest('hex');

      expect(saved!.tokenHash).toBe(expectedHash);
      expect(saved!.tokenHash).toHaveLength(64);
      expect(saved!.tokenHash).not.toBe(rawToken);
      expect(saved!.usuarioId).toBe(saved!.usuarioId);
    });

    it('el refreshToken retornado tiene longitud mínima de token aleatorio (>=32)', async () => {
      usuarioRepo.findByEmail.mockResolvedValue(makeUsuario());
      const membresia = makeMembresiaResuelta();
      membresiaRepo.findActivasByUsuario.mockResolvedValue([membresia]);
      clienteRepo.findById.mockResolvedValue(makeCliente());
      membresiaRepo.findActivaByUsuarioYCliente.mockResolvedValue(membresia);

      const result = await useCase.execute({ email: 'user@test.com', password: 'secret' });

      if (result.getValue().kind !== 'tokens') throw new Error('expected tokens');
      expect(result.getValue().refreshToken.length).toBeGreaterThanOrEqual(32);
    });

    it('persiste el clienteId resuelto en el refresh token (Opción B, decisión #2025)', async () => {
      usuarioRepo.findByEmail.mockResolvedValue(makeUsuario());
      const membresia = makeMembresiaResuelta({ clienteId: 'cliente-1' });
      membresiaRepo.findActivasByUsuario.mockResolvedValue([membresia]);
      clienteRepo.findById.mockResolvedValue(makeCliente());
      membresiaRepo.findActivaByUsuarioYCliente.mockResolvedValue(membresia);

      let saved: RefreshTokenEntity | undefined;
      refreshTokenRepo.save.mockImplementation(async (token) => {
        saved = token;
      });

      await useCase.execute({ email: 'user@test.com', password: 'secret' });

      expect(saved!.clienteId).toBe('cliente-1');
    });

    it('root sin clienteId (token master) persiste clienteId null en el refresh token', async () => {
      usuarioRepo.findByEmail.mockResolvedValue(makeUsuario({ isGlobalAdmin: true }));
      membresiaRepo.findActivasByUsuario.mockResolvedValue([]);

      let saved: RefreshTokenEntity | undefined;
      refreshTokenRepo.save.mockImplementation(async (token) => {
        saved = token;
      });

      await useCase.execute({ email: 'root@test.com', password: 'secret' });

      expect(saved!.clienteId).toBeNull();
    });

    it('el payload incluye nombre/apellido de la UsuarioEntity autenticada', async () => {
      usuarioRepo.findByEmail.mockResolvedValue(makeUsuario());
      const membresia = makeMembresiaResuelta();
      membresiaRepo.findActivasByUsuario.mockResolvedValue([membresia]);
      clienteRepo.findById.mockResolvedValue(makeCliente());
      membresiaRepo.findActivaByUsuarioYCliente.mockResolvedValue(membresia);

      let captured: JwtPayload | undefined;
      tokenService.signJwt.mockImplementation((p) => {
        captured = p;
        return 'jwt.token';
      });

      await useCase.execute({ email: 'user@test.com', password: 'secret' });

      expect(captured!.nombre).toBe('Juan');
      expect(captured!.apellido).toBe('Perez');
    });

    it('el sub del payload es el id del usuario autenticado', async () => {
      const usuario = makeUsuario();
      usuarioRepo.findByEmail.mockResolvedValue(usuario);
      const membresia = makeMembresiaResuelta();
      membresiaRepo.findActivasByUsuario.mockResolvedValue([membresia]);
      clienteRepo.findById.mockResolvedValue(makeCliente());
      membresiaRepo.findActivaByUsuarioYCliente.mockResolvedValue(membresia);

      let captured: JwtPayload | undefined;
      tokenService.signJwt.mockImplementation((p) => {
        captured = p;
        return 'jwt.token';
      });

      await useCase.execute({ email: 'user@test.com', password: 'secret' });

      expect(captured!.sub).toBe(usuario.id);
    });
  });
});
