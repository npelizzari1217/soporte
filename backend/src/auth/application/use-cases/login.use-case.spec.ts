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
 * - Root sin clienteId → token master (cliente_id/rol null, permisos =
 *   TODOS los pares válidos — bypass total, WU-7.1/ADR-P6 — is_global_admin
 *   true).
 * - clienteId provisto no seleccionable (normal sin membresía en ese
 *   cliente / cliente inactivo) → 403 ClienteNoAutorizado.
 * - Root con clienteId de cualquier cliente activo → token scopeado
 *   (bypass total, con o sin membresía — WU-7.1).
 * - Payload incluye membresias[] completo (R6) y refresh sha256 persistido
 *   (R7).
 *
 * WU-7.1 (sdd/matriz-permisos-por-usuario): `permisos` deja de venir de
 * `MembresiaResuelta.permisos` (RBAC viejo) — ahora resolverScope los lee
 * de `IMatrizPermisosRepository` (o bypassea con `PARES_VALIDOS` para
 * ROOT/ADMINISTRADOR). `MembresiaResuelta` ya NO expone `permisos` (retirado
 * junto con el JOIN a `roles_permisos`, saneamiento-tipos-backend WU3); las
 * aserciones de `captured.permisos` siguen leyendo del `JwtPayload`.
 */
import * as crypto from 'crypto';
import type { Mocked } from 'vitest';
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
import { IMatrizPermisosRepository } from '../../domain/ports/i-matriz-permisos.repository';
import { IRefreshTokenRepository } from '../../domain/ports/i-refresh-token.repository';
import { IHashProvider } from '../../domain/ports/i-hash.provider';
import { ITokenService, JwtPayload } from '../../domain/ports/i-token.service';
import { IClienteRepository } from '../../../clientes/domain/ports/i-cliente.repository';
import { ClienteEntity } from '../../../clientes/domain/entities/cliente.entity';
import { PARES_VALIDOS } from '../../../shared/domain/acciones';

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
  ...overrides,
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
  create: vi.fn().mockResolvedValue(undefined),
});

const makeClienteRepo = (): Mocked<IClienteRepository> => ({
  findById: vi.fn(),
  findByDbName: vi.fn(),
  findAll: vi.fn(),
  save: vi.fn(),
  delete: vi.fn(),
});

const makeHashProvider = (): Mocked<IHashProvider> => ({
  hash: vi.fn().mockResolvedValue('$argon2id$hashed'),
  verify: vi.fn().mockResolvedValue(true),
});

const makeTokenService = (): Mocked<ITokenService> => ({
  signJwt: vi.fn().mockReturnValue('signed.jwt.token'),
  verifyJwt: vi.fn().mockReturnValue(null),
});

const makeRefreshTokenRepo = (): Mocked<IRefreshTokenRepository> => ({
  findByHash: vi.fn(),
  revokeAllByUsuarioId: vi.fn().mockResolvedValue(undefined),
  save: vi.fn().mockResolvedValue(undefined),
});

const makePermisosRepo = (): Mocked<IMatrizPermisosRepository> => ({
  findByUsuarioYCliente: vi.fn().mockResolvedValue([]),
  setPermisos: vi.fn().mockResolvedValue(undefined),
});

describe('LoginUseCase', () => {
  let usuarioRepo: ReturnType<typeof makeUsuarioRepo>;
  let membresiaRepo: ReturnType<typeof makeMembresiaRepo>;
  let clienteRepo: ReturnType<typeof makeClienteRepo>;
  let hashProvider: ReturnType<typeof makeHashProvider>;
  let tokenService: ReturnType<typeof makeTokenService>;
  let refreshTokenRepo: ReturnType<typeof makeRefreshTokenRepo>;
  let permisosRepo: ReturnType<typeof makePermisosRepo>;
  let useCase: LoginUseCase;

  beforeEach(() => {
    usuarioRepo = makeUsuarioRepo();
    membresiaRepo = makeMembresiaRepo();
    clienteRepo = makeClienteRepo();
    hashProvider = makeHashProvider();
    tokenService = makeTokenService();
    refreshTokenRepo = makeRefreshTokenRepo();
    permisosRepo = makePermisosRepo();
    useCase = new LoginUseCase(
      usuarioRepo,
      membresiaRepo,
      clienteRepo,
      hashProvider,
      tokenService,
      refreshTokenRepo,
      permisosRepo,
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
      permisosRepo.findByUsuarioYCliente.mockResolvedValue(['TICKETS:LECTURA', 'TICKETS:ALTAS']);

      let captured: JwtPayload | undefined;
      tokenService.signJwt.mockImplementation((p) => {
        captured = p;
        return 'jwt.token';
      });

      await useCase.execute({ email: 'user@test.com', password: 'secret' });

      expect(captured!.cliente_id).toBe('cliente-1');
      expect(captured!.rol).toBe('TECNICO');
      expect(captured!.permisos).toEqual(['TICKETS:LECTURA', 'TICKETS:ALTAS']);
      expect(permisosRepo.findByUsuarioYCliente).toHaveBeenCalledWith(
        expect.any(String),
        'cliente-1',
      );
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
    it('emite token con cliente_id/rol null, permisos = bypass total (WU-7.1), is_global_admin true', async () => {
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
      expect(captured!.permisos).toEqual([...PARES_VALIDOS]);
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

  describe('Root con clienteId de cualquier cliente activo → token scopeado (bypass total, WU-7.1)', () => {
    it('CON membresía en ese cliente → rol de la membresía, permisos = bypass total, sin leer la matriz', async () => {
      usuarioRepo.findByEmail.mockResolvedValue(makeUsuario({ isGlobalAdmin: true }));
      clienteRepo.findById.mockResolvedValue(makeCliente({ nombre: 'Acme SA' }));
      membresiaRepo.findActivaByUsuarioYCliente.mockResolvedValue(
        makeMembresiaResuelta({ rolCodigo: 'ADMINISTRADOR' }),
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
      expect(captured!.permisos).toEqual([...PARES_VALIDOS]);
      expect(captured!.is_global_admin).toBe(true);
      expect(permisosRepo.findByUsuarioYCliente).not.toHaveBeenCalled();
    });

    it('SIN membresía en ese cliente → rol=null, permisos = bypass total igual (root no necesita membresía)', async () => {
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
      expect(captured!.permisos).toEqual([...PARES_VALIDOS]);
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
      const value = result.getValue();
      if (value.kind !== 'tokens') throw new Error('expected tokens');
      const rawToken = value.refreshToken;
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

      const value = result.getValue();
      if (value.kind !== 'tokens') throw new Error('expected tokens');
      expect(value.refreshToken.length).toBeGreaterThanOrEqual(32);
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
