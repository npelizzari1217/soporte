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
import { ILimitadorIntentos } from '../../domain/ports/limitador-intentos.port';
import { unstubbed } from '../../../testing/mocks';

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
  clienteRequiere2fa: false,
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
  // LoginUseCase nunca llama a estos métodos (solo lee membresías, nunca
  // crea/muta): un stub mudo taparía que producción empiece a llamarlos.
  findActivasByCliente: unstubbed('findActivasByCliente'),
  findClientesDeTodasByUsuario: unstubbed('findClientesDeTodasByUsuario'),
  findByUsuarioYCliente: unstubbed('findByUsuarioYCliente'),
  create: unstubbed('create'),
  save: unstubbed('save'),
});

const makeClienteRepo = (): Mocked<IClienteRepository> => ({
  findById: vi.fn(),
  findByDbName: vi.fn(),
  findBySlug: vi.fn(),
  congelarSlug: vi.fn(),
  fijarRequiere2fa: vi.fn(),
  obtenerRequiere2fa: vi.fn(),
  cambiarSlugSiNoCongelado: vi.fn(),
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

const RESERVA = { clave: 'k', ventanaInicio: new Date() };

const makeLimitador = (): Mocked<ILimitadorIntentos> => ({
  reservar: vi.fn().mockResolvedValue(RESERVA),
  liberar: vi.fn().mockResolvedValue(undefined),
  devolver: vi.fn().mockResolvedValue(undefined),
});

const makeTfaRepo = () => ({
  obtener: vi.fn().mockResolvedValue(null),
  ...unstubbedTfa(),
});
function unstubbedTfa() {
  const noUsado = (n: string) => unstubbed(n);
  return {
    guardarPendiente: noUsado('guardarPendiente'),
    promoverPendiente: noUsado('promoverPendiente'),
    registrarPaso: noUsado('registrarPaso'),
    reemplazarCodigos: noUsado('reemplazarCodigos'),
    obtenerCodigosDisponibles: noUsado('obtenerCodigosDisponibles'),
    consumirCodigo: noUsado('consumirCodigo'),
    contarCodigosRestantes: noUsado('contarCodigosRestantes'),
    eliminarTodo: noUsado('eliminarTodo'),
  };
}

const makeDesafios = () => ({
  crear: vi.fn((_u: string, proposito: string) => Promise.resolve(`desafio-${proposito}`)),
  buscarSinVerificar: unstubbed('buscarSinVerificar'),
  verificar: unstubbed('verificar'),
  buscarTicket: unstubbed('buscarTicket'),
  consumir: unstubbed('consumir'),
});

const makeDispositivos = () => ({
  crear: unstubbed('crear'),
  esValido: vi.fn().mockResolvedValue(false),
  revocarTodosDe: unstubbed('revocarTodosDe'),
});

describe('LoginUseCase', () => {
  let dispositivos: ReturnType<typeof makeDispositivos>;
  let tfaRepo: ReturnType<typeof makeTfaRepo>;
  let desafios: ReturnType<typeof makeDesafios>;
  let limitador: ReturnType<typeof makeLimitador>;
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
    limitador = makeLimitador();
    tfaRepo = makeTfaRepo();
    desafios = makeDesafios();
    dispositivos = makeDispositivos();
    useCase = new LoginUseCase(
      usuarioRepo,
      membresiaRepo,
      clienteRepo,
      hashProvider,
      tokenService,
      refreshTokenRepo,
      permisosRepo,
      limitador,
      tfaRepo,
      desafios,
      dispositivos,
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

    it('propaga cliente_logo_v desde resolverScope (sdd/logo-por-cliente, WU3)', async () => {
      usuarioRepo.findByEmail.mockResolvedValue(makeUsuario());
      const membresia = makeMembresiaResuelta({ clienteId: 'cliente-1', rolCodigo: 'TECNICO' });
      membresiaRepo.findActivasByUsuario.mockResolvedValue([membresia]);
      const cliente = makeCliente({ nombre: 'Acme SA' });
      const logoUpdatedAt = new Date('2026-05-01T00:00:00.000Z');
      cliente.actualizarLogo('clientes/cliente-1/logo.png', 'image/png', logoUpdatedAt);
      clienteRepo.findById.mockResolvedValue(cliente);
      membresiaRepo.findActivaByUsuarioYCliente.mockResolvedValue(membresia);
      permisosRepo.findByUsuarioYCliente.mockResolvedValue([]);

      let captured: JwtPayload | undefined;
      tokenService.signJwt.mockImplementation((p) => {
        captured = p;
        return 'jwt.token';
      });

      await useCase.execute({ email: 'user@test.com', password: 'secret' });

      expect(captured!.cliente_logo_v).toBe(logoUpdatedAt.getTime());
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

    it('cliente inactivo', async () => {
      usuarioRepo.findByEmail.mockResolvedValue(makeUsuario());
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

  // ─── WU-5c — decision del segundo paso (L1, L3, L4, L5, L7) ────────────────

  describe('Segundo paso tras la contrasena valida', () => {
    const EST_ACTIVO = {
      secretoCifrado: 'cifrado',
      confirmadoAt: new Date(),
      ultimoPaso: 0,
      secretoPendienteCifrado: null,
      pendienteCreadoAt: null,
    };

    it('2FA activo → desafio VERIFICAR y {needs2fa} sin emitir sesion (L4)', async () => {
      usuarioRepo.findByEmail.mockResolvedValue(makeUsuario());
      membresiaRepo.findActivasByUsuario.mockResolvedValue([makeMembresiaResuelta()]);
      tfaRepo.obtener.mockResolvedValue(EST_ACTIVO);

      const result = await useCase.execute({ email: 'user@test.com', password: 'secret' });

      expect(result.getValue()).toEqual({
        kind: 'needs2fa',
        desafio: 'desafio-VERIFICAR',
        recordarDisponible: true,
      });
      expect(desafios.crear).toHaveBeenCalledWith(expect.any(String), 'VERIFICAR');
      expect(tokenService.signJwt).not.toHaveBeenCalled();
      expect(refreshTokenRepo.save).not.toHaveBeenCalled();
    });

    it('un secreto pendiente (sin secreto activo) no se pide en el login (T4)', async () => {
      usuarioRepo.findByEmail.mockResolvedValue(makeUsuario());
      const membresia = makeMembresiaResuelta();
      membresiaRepo.findActivasByUsuario.mockResolvedValue([membresia]);
      clienteRepo.findById.mockResolvedValue(makeCliente());
      membresiaRepo.findActivaByUsuarioYCliente.mockResolvedValue(membresia);
      tfaRepo.obtener.mockResolvedValue({
        secretoCifrado: null,
        confirmadoAt: null,
        ultimoPaso: 0,
        secretoPendienteCifrado: 'pendiente-cifrado',
        pendienteCreadoAt: new Date(),
      });

      const result = await useCase.execute({ email: 'user@test.com', password: 'secret' });

      expect(result.getValue().kind).toBe('tokens');
      expect(desafios.crear).not.toHaveBeenCalled();
    });

    it('ROOT sin 2FA → desafio ENROLAR y {needsEnrolamiento2fa}, nunca un access token (L3, L5)', async () => {
      usuarioRepo.findByEmail.mockResolvedValue(makeUsuario({ isGlobalAdmin: true }));
      tfaRepo.obtener.mockResolvedValue(null);

      const result = await useCase.execute({ email: 'root@test.com', password: 'secret' });

      expect(result.getValue()).toEqual({
        kind: 'needsEnrolamiento2fa',
        desafio: 'desafio-ENROLAR',
      });
      expect(tokenService.signJwt).not.toHaveBeenCalled();
    });

    describe('dispositivo confiable (D3, D4)', () => {
      const entrar = (extra = {}) =>
        useCase.execute({
          email: 'user@test.com',
          password: 'secret',
          dispositivoConfiable: 'token-crudo',
          ...extra,
        });
      const hashDelToken = crypto.createHash('sha256').update('token-crudo').digest('hex');

      beforeEach(() => {
        usuarioRepo.findByEmail.mockResolvedValue(makeUsuario());
        const membresia = makeMembresiaResuelta();
        membresiaRepo.findActivasByUsuario.mockResolvedValue([membresia]);
        membresiaRepo.findActivaByUsuarioYCliente.mockResolvedValue(membresia);
        clienteRepo.findById.mockResolvedValue(makeCliente({ nombre: 'Acme SA' }));
        tfaRepo.obtener.mockResolvedValue(EST_ACTIVO);
      });

      it('un token valido del usuario omite el desafio y consulta por el hash, no por el crudo', async () => {
        dispositivos.esValido.mockResolvedValue(true);
        expect((await entrar()).getValue().kind).toBe('tokens');
        expect(dispositivos.esValido).toHaveBeenCalledWith(
          expect.any(String),
          hashDelToken,
          expect.any(Date),
        );
        expect(desafios.crear).not.toHaveBeenCalled();
      });

      it('no omite la contrasena: password incorrecta sigue siendo 401', async () => {
        dispositivos.esValido.mockResolvedValue(true);
        hashProvider.verify.mockResolvedValue(false);
        expect((await entrar()).isFail()).toBe(true);
        expect(dispositivos.esValido).not.toHaveBeenCalled();
      });

      it('un token ajeno, revocado o vencido (esValido falso) sigue con el desafio', async () => {
        dispositivos.esValido.mockResolvedValue(false);
        expect((await entrar()).getValue()).toMatchObject({ kind: 'needs2fa' });
      });

      it('sin token no consulta el repositorio y sigue con el desafio', async () => {
        const r = await entrar({ dispositivoConfiable: undefined });
        expect(r.getValue()).toMatchObject({ kind: 'needs2fa' });
        expect(dispositivos.esValido).not.toHaveBeenCalled();
      });

      it('un token valido de quien hoy es ROOT se ignora (D4)', async () => {
        usuarioRepo.findByEmail.mockResolvedValue(makeUsuario({ isGlobalAdmin: true }));
        dispositivos.esValido.mockResolvedValue(true);
        expect((await entrar()).getValue()).toMatchObject({ kind: 'needs2fa' });
        expect(dispositivos.esValido).not.toHaveBeenCalled();
      });
    });

    it('ROOT con 2FA → VERIFICAR sin dispositivo confiable (D4)', async () => {
      usuarioRepo.findByEmail.mockResolvedValue(makeUsuario({ isGlobalAdmin: true }));
      tfaRepo.obtener.mockResolvedValue(EST_ACTIVO);

      const result = await useCase.execute({ email: 'root@test.com', password: 'secret' });

      expect(result.getValue()).toMatchObject({ kind: 'needs2fa', recordarDisponible: false });
    });

    it('una membresia cuyo cliente exige 2FA obliga al enrolamiento (L3, C3)', async () => {
      usuarioRepo.findByEmail.mockResolvedValue(makeUsuario());
      membresiaRepo.findActivasByUsuario.mockResolvedValue([
        makeMembresiaResuelta({ clienteId: 'a' }),
        makeMembresiaResuelta({ clienteId: 'b', clienteRequiere2fa: true }),
      ]);
      tfaRepo.obtener.mockResolvedValue(null);

      const result = await useCase.execute({ email: 'user@test.com', password: 'secret' });

      expect(result.getValue().kind).toBe('needsEnrolamiento2fa');
    });

    it('con segundo paso, clienteId se ignora (L7)', async () => {
      usuarioRepo.findByEmail.mockResolvedValue(makeUsuario());
      membresiaRepo.findActivasByUsuario.mockResolvedValue([makeMembresiaResuelta()]);
      tfaRepo.obtener.mockResolvedValue(EST_ACTIVO);

      const result = await useCase.execute({
        email: 'user@test.com',
        password: 'secret',
        clienteId: 'otro',
      });

      expect(result.getValue().kind).toBe('needs2fa');
      expect(membresiaRepo.findActivaByUsuarioYCliente).not.toHaveBeenCalled();
    });

    it('sin 2FA y mas de una membresia → SELECCIONAR con ticket, sin sesion (L7)', async () => {
      usuarioRepo.findByEmail.mockResolvedValue(makeUsuario());
      membresiaRepo.findActivasByUsuario.mockResolvedValue([
        makeMembresiaResuelta({ clienteId: 'a' }),
        makeMembresiaResuelta({ clienteId: 'b' }),
      ]);

      const result = await useCase.execute({ email: 'user@test.com', password: 'secret' });

      expect(result.getValue()).toMatchObject({ kind: 'selection', ticket: 'desafio-SELECCIONAR' });
      expect(tokenService.signJwt).not.toHaveBeenCalled();
    });

    it('contrasena invalida: no consulta el 2FA ni revela si lo hay (L1)', async () => {
      usuarioRepo.findByEmail.mockResolvedValue(makeUsuario());
      hashProvider.verify.mockResolvedValue(false);
      tfaRepo.obtener.mockResolvedValue(EST_ACTIVO);

      const result = await useCase.execute({ email: 'user@test.com', password: 'mala' });

      expect(result.getError()).toBeInstanceOf(CredencialesInvalidasError);
      expect(tfaRepo.obtener).not.toHaveBeenCalled();
      expect(desafios.crear).not.toHaveBeenCalled();
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

  // ─── WU-3 — limitador de intentos (I1, I2, I3, I5) ────────────────────────

  describe('Limitador de intentos', () => {
    const clave = (email: string, ip: string) =>
      `pwd:${crypto.createHash('sha256').update(email).digest('hex')}:${ip}`;

    it('la clave es pwd:{sha256(email normalizado)}:{ip}, sin el email en claro', async () => {
      usuarioRepo.findByEmail.mockResolvedValue(null);

      await useCase.execute({ email: '  Juan@Test.COM ', password: 'x', ip: '203.0.113.9' });

      const usada = limitador.reservar.mock.calls[0][0];
      expect(usada).toBe(clave('juan@test.com', '203.0.113.9'));
      expect(usada).not.toContain('juan');
    });

    it('sin ip usa sin-ip', async () => {
      usuarioRepo.findByEmail.mockResolvedValue(null);

      await useCase.execute({ email: 'a@test.com', password: 'x' });

      expect(limitador.reservar).toHaveBeenCalledWith(clave('a@test.com', 'sin-ip'));
    });

    it('bloqueado: ejecuta verify(DUMMY_HASH), no busca al usuario y devuelve CredencialesInvalidas', async () => {
      limitador.reservar.mockResolvedValue(null);

      const result = await useCase.execute({ email: 'user@test.com', password: 'bien' });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(CredencialesInvalidasError);
      expect(hashProvider.verify).toHaveBeenCalledWith('bien', DUMMY_HASH);
      expect(usuarioRepo.findByEmail).not.toHaveBeenCalled();
      expect(limitador.liberar).not.toHaveBeenCalled();
    });

    it('bloqueado y fallo normal son indistinguibles (mismo error y mismo mensaje)', async () => {
      usuarioRepo.findByEmail.mockResolvedValue(null);
      const normal = await useCase.execute({ email: 'a@test.com', password: 'x' });
      limitador.reservar.mockResolvedValue(null);
      const bloqueado = await useCase.execute({ email: 'a@test.com', password: 'x' });

      expect(bloqueado.getError()).toEqual(normal.getError());
    });

    it('password incorrecto no libera (la reserva queda como fallo)', async () => {
      usuarioRepo.findByEmail.mockResolvedValue(makeUsuario());
      hashProvider.verify.mockResolvedValue(false);

      await useCase.execute({ email: 'user@test.com', password: 'mal' });

      expect(limitador.liberar).not.toHaveBeenCalled();
    });

    it('email inexistente cuenta igual: reserva y no libera', async () => {
      usuarioRepo.findByEmail.mockResolvedValue(null);

      await useCase.execute({ email: 'noexiste@test.com', password: 'x' });

      expect(limitador.reservar).toHaveBeenCalledTimes(1);
      expect(limitador.liberar).not.toHaveBeenCalled();
    });

    it('password correcto libera la clave', async () => {
      usuarioRepo.findByEmail.mockResolvedValue(makeUsuario());
      membresiaRepo.findActivasByUsuario.mockResolvedValue([]);

      await useCase.execute({ email: 'user@test.com', password: 'ok', ip: '1.2.3.4' });

      expect(limitador.liberar).toHaveBeenCalledWith(clave('user@test.com', '1.2.3.4'));
    });
  });
});
