/**
 * T4.6–T4.8 TEST — Unit tests de SwitchTenantUseCase (RED → GREEN)
 *
 * Cubre (R10):
 * - Root → cualquier cliente activo no borrado es válido.
 * - Root con membresía en ese cliente → rol/permisos de la membresía.
 * - Root sin membresía en ese cliente → rol=null/permisos=[], igual autorizado.
 * - Normal → clienteId DEBE tener membresía activa; sin ella → 403
 *   ClienteNoAutorizado.
 * - Emite SOLO el access token (no toca refresh tokens — SwitchTenantUseCase
 *   no depende de IRefreshTokenRepository, verificado por su firma).
 * - Audita el salto vía ILogger.log con formato exacto
 *   `SWITCH TENANT | usuario={sub} | from={cliente_id} | to={clienteId} | at={ISO}`.
 * - El nuevo payload incluye membresias[] completo (consistencia con
 *   login/refresh — ADR-3).
 */
import type { Mocked } from 'vitest';
import { SwitchTenantUseCase, SwitchTenantDto } from './switch-tenant.use-case';
import { ClienteEntity } from '../../../clientes/domain/entities/cliente.entity';
import { IMembresiaRepository, MembresiaResuelta } from '../../domain/ports/i-membresia.repository';
import { IMatrizPermisosRepository } from '../../domain/ports/i-matriz-permisos.repository';
import { IClienteRepository } from '../../../clientes/domain/ports/i-cliente.repository';
import { ITokenService, JwtPayload } from '../../domain/ports/i-token.service';
import { ILogger } from '../../../shared/domain/ports/i-logger.port';
import { ClienteNoAutorizadoError } from '../../domain/errors/auth.errors';
import { payloadDeTest } from '../../test-helpers/payload-de-test';
import { PARES_VALIDOS } from '../../../shared/domain/acciones';

const makeCliente = (nombre = 'Acme SA', activo = true): ClienteEntity =>
  ClienteEntity.create({ nombre, razonSocial: null, cuit: null, dbName: 'acme_sa', activo });

/**
 * `MembresiaResuelta` ya NO expone `permisos`: el fix de C2 retiró el campo
 * junto con el JOIN a `roles_permisos` que lo poblaba, porque corría en cada
 * login y habría hecho estallar el login cuando WU-9 dropee esas tablas. Los
 * permisos salen de la matriz, no de la membresía.
 */
const makeMembresiaResuelta = (overrides: Partial<MembresiaResuelta> = {}): MembresiaResuelta => ({
  clienteId: 'cliente-2',
  clienteNombre: 'Beta SA',
  rolCodigo: 'ADMINISTRADOR',
  ...overrides,
});

const makeActorPayload = (overrides: Partial<JwtPayload> = {}): JwtPayload =>
  payloadDeTest({
    sub: 'usuario-1',
    cliente_id: 'cliente-1',
    rol: 'TECNICO',
    permisos: ['ticket:crear'],
    is_global_admin: false,
    cliente_nombre: 'Acme SA',
    nombre: 'Juan',
    apellido: 'Perez',
    ...overrides,
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

const makeTokenService = (): Mocked<ITokenService> => ({
  signJwt: vi.fn().mockReturnValue('new.access.token'),
  verifyJwt: vi.fn().mockReturnValue(null),
});

const makeLogger = (): Mocked<ILogger> => ({
  log: vi.fn(),
});

const makePermisosRepo = (): Mocked<IMatrizPermisosRepository> => ({
  findByUsuarioYCliente: vi.fn().mockResolvedValue([]),
  setPermisos: vi.fn().mockResolvedValue(undefined),
});

describe('SwitchTenantUseCase', () => {
  let membresiaRepo: Mocked<IMembresiaRepository>;
  let clienteRepo: Mocked<IClienteRepository>;
  let tokenService: Mocked<ITokenService>;
  let logger: Mocked<ILogger>;
  let permisosRepo: Mocked<IMatrizPermisosRepository>;
  let useCase: SwitchTenantUseCase;

  beforeEach(() => {
    membresiaRepo = makeMembresiaRepo();
    clienteRepo = makeClienteRepo();
    tokenService = makeTokenService();
    logger = makeLogger();
    permisosRepo = makePermisosRepo();
    useCase = new SwitchTenantUseCase(
      membresiaRepo,
      clienteRepo,
      tokenService,
      logger,
      permisosRepo,
    );
  });

  describe('Root → cualquier cliente activo no borrado (bypass total, WU-7.1)', () => {
    it('CON membresía en el cliente destino → rol de la membresía, permisos = bypass total', async () => {
      const actor = makeActorPayload({ is_global_admin: true, cliente_id: null, rol: null });
      clienteRepo.findById.mockResolvedValue(makeCliente('Beta SA'));
      membresiaRepo.findActivaByUsuarioYCliente.mockResolvedValue(makeMembresiaResuelta());

      let captured: JwtPayload | undefined;
      tokenService.signJwt.mockImplementation((p) => {
        captured = p;
        return 'new.access.token';
      });

      const dto: SwitchTenantDto = { actor, clienteId: 'cliente-2' };
      const result = await useCase.execute(dto);

      expect(result.isOk()).toBe(true);
      expect(result.getValue()).toEqual({ accessToken: 'new.access.token' });
      expect(captured!.cliente_id).toBe('cliente-2');
      expect(captured!.rol).toBe('ADMINISTRADOR');
      expect(captured!.permisos).toEqual([...PARES_VALIDOS]);
      expect(captured!.is_global_admin).toBe(true);
      expect(permisosRepo.findByUsuarioYCliente).not.toHaveBeenCalled();
    });

    it('SIN membresía en el cliente destino → rol=null, permisos = bypass total igual, autorizado', async () => {
      const actor = makeActorPayload({ is_global_admin: true });
      clienteRepo.findById.mockResolvedValue(makeCliente('Beta SA'));
      membresiaRepo.findActivaByUsuarioYCliente.mockResolvedValue(null);

      let captured: JwtPayload | undefined;
      tokenService.signJwt.mockImplementation((p) => {
        captured = p;
        return 'new.access.token';
      });

      const result = await useCase.execute({ actor, clienteId: 'cliente-2' });

      expect(result.isOk()).toBe(true);
      expect(captured!.rol).toBeNull();
      expect(captured!.permisos).toEqual([...PARES_VALIDOS]);
      expect(captured!.cliente_nombre).toBe('Beta SA');
    });

    it('cliente inactivo → ClienteNoAutorizado (incluso siendo root)', async () => {
      const actor = makeActorPayload({ is_global_admin: true });
      clienteRepo.findById.mockResolvedValue(makeCliente('Beta SA', false));

      const result = await useCase.execute({ actor, clienteId: 'cliente-2' });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(ClienteNoAutorizadoError);
      expect(tokenService.signJwt).not.toHaveBeenCalled();
    });
  });

  describe('Normal → clienteId DEBE tener membresía activa', () => {
    it('CON membresía → autorizado, rol/permisos de la membresía', async () => {
      const actor = makeActorPayload({ is_global_admin: false });
      clienteRepo.findById.mockResolvedValue(makeCliente('Beta SA'));
      membresiaRepo.findActivaByUsuarioYCliente.mockResolvedValue(makeMembresiaResuelta());

      const result = await useCase.execute({ actor, clienteId: 'cliente-2' });

      expect(result.isOk()).toBe(true);
    });

    it('SIN membresía → 403 ClienteNoAutorizado', async () => {
      const actor = makeActorPayload({ is_global_admin: false });
      clienteRepo.findById.mockResolvedValue(makeCliente('Beta SA'));
      membresiaRepo.findActivaByUsuarioYCliente.mockResolvedValue(null);

      const result = await useCase.execute({ actor, clienteId: 'cliente-2' });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(ClienteNoAutorizadoError);
      expect(tokenService.signJwt).not.toHaveBeenCalled();
    });
  });

  describe('Emite SOLO access token (no rota refresh)', () => {
    it('el constructor toma exactamente 5 puertos (sin IRefreshTokenRepository — no rota refresh)', () => {
      expect(useCase).toBeInstanceOf(SwitchTenantUseCase);
      expect(SwitchTenantUseCase.length).toBe(5);
    });

    it('el resultado exitoso solo expone accessToken', async () => {
      const actor = makeActorPayload({ is_global_admin: true });
      clienteRepo.findById.mockResolvedValue(makeCliente());
      membresiaRepo.findActivaByUsuarioYCliente.mockResolvedValue(makeMembresiaResuelta());

      const result = await useCase.execute({ actor, clienteId: 'cliente-2' });

      expect(Object.keys(result.getValue())).toEqual(['accessToken']);
    });
  });

  describe('Auditoría del salto (R10)', () => {
    it('llama logger.log con el formato exacto SWITCH TENANT | usuario=... | from=... | to=... | at=ISO', async () => {
      const actor = makeActorPayload({
        sub: 'usuario-1',
        is_global_admin: false,
        cliente_id: 'cliente-1',
      });
      clienteRepo.findById.mockResolvedValue(makeCliente('Beta SA'));
      membresiaRepo.findActivaByUsuarioYCliente.mockResolvedValue(makeMembresiaResuelta());

      await useCase.execute({ actor, clienteId: 'cliente-2' });

      expect(logger.log).toHaveBeenCalledTimes(1);
      const [message] = logger.log.mock.calls[0];
      expect(message).toMatch(
        /^SWITCH TENANT \| usuario=usuario-1 \| from=cliente-1 \| to=cliente-2 \| at=\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
      );
    });

    it('audita "from=null" cuando el actor viene del scope MASTER', async () => {
      const actor = makeActorPayload({ sub: 'root-1', is_global_admin: true, cliente_id: null });
      clienteRepo.findById.mockResolvedValue(makeCliente());
      membresiaRepo.findActivaByUsuarioYCliente.mockResolvedValue(null);

      await useCase.execute({ actor, clienteId: 'cliente-2' });

      const [message] = logger.log.mock.calls[0];
      expect(message).toContain('from=null');
      expect(message).toContain('to=cliente-2');
    });

    it('NO audita si el switch fue rechazado (sin membresía)', async () => {
      const actor = makeActorPayload({ is_global_admin: false });
      clienteRepo.findById.mockResolvedValue(makeCliente());
      membresiaRepo.findActivaByUsuarioYCliente.mockResolvedValue(null);

      await useCase.execute({ actor, clienteId: 'cliente-2' });

      expect(logger.log).not.toHaveBeenCalled();
    });
  });

  describe('Payload consistente con login/refresh (ADR-3)', () => {
    it('incluye membresias[] completo del actor', async () => {
      const actor = makeActorPayload({ is_global_admin: false });
      clienteRepo.findById.mockResolvedValue(makeCliente('Beta SA'));
      membresiaRepo.findActivaByUsuarioYCliente.mockResolvedValue(makeMembresiaResuelta());
      const m1 = makeMembresiaResuelta({
        clienteId: 'cliente-1',
        clienteNombre: 'Acme SA',
        rolCodigo: 'TECNICO',
      });
      const m2 = makeMembresiaResuelta({
        clienteId: 'cliente-2',
        clienteNombre: 'Beta SA',
        rolCodigo: 'ADMINISTRADOR',
      });
      membresiaRepo.findActivasByUsuario.mockResolvedValue([m1, m2]);

      let captured: JwtPayload | undefined;
      tokenService.signJwt.mockImplementation((p) => {
        captured = p;
        return 'new.access.token';
      });

      await useCase.execute({ actor, clienteId: 'cliente-2' });

      expect(captured!.membresias).toEqual([
        { cliente_id: 'cliente-1', nombre: 'Acme SA', rol: 'TECNICO' },
        { cliente_id: 'cliente-2', nombre: 'Beta SA', rol: 'ADMINISTRADOR' },
      ]);
    });

    it('el sub del nuevo payload es el mismo del actor', async () => {
      const actor = makeActorPayload({ sub: 'usuario-fijo', is_global_admin: true });
      clienteRepo.findById.mockResolvedValue(makeCliente());
      membresiaRepo.findActivaByUsuarioYCliente.mockResolvedValue(null);

      let captured: JwtPayload | undefined;
      tokenService.signJwt.mockImplementation((p) => {
        captured = p;
        return 'new.access.token';
      });

      await useCase.execute({ actor, clienteId: 'cliente-2' });

      expect(captured!.sub).toBe('usuario-fijo');
    });
  });

  describe('Identidad (nombre/apellido) — propagada del payload entrante, sin carga extra a DB', () => {
    it('propaga nombre/apellido TAL CUAL del actor (payload entrante ya verificado)', async () => {
      const actor = makeActorPayload({ is_global_admin: true, nombre: 'Ana', apellido: 'Gómez' });
      clienteRepo.findById.mockResolvedValue(makeCliente('Beta SA'));
      membresiaRepo.findActivaByUsuarioYCliente.mockResolvedValue(makeMembresiaResuelta());

      let captured: JwtPayload | undefined;
      tokenService.signJwt.mockImplementation((p) => {
        captured = p;
        return 'new.access.token';
      });

      await useCase.execute({ actor, clienteId: 'cliente-2' });

      expect(captured!.nombre).toBe('Ana');
      expect(captured!.apellido).toBe('Gómez');
    });

    it('token pre-rollout sin nombre/apellido en el payload entrante → default "" (no crashea)', async () => {
      // Simula un token emitido ANTES de agregar estos campos: el actor
      // decodificado no los trae (ventana de rollout — ver docstring de la clase).
      const actor = makeActorPayload({ is_global_admin: true });
      delete (actor as Partial<JwtPayload>).nombre;
      delete (actor as Partial<JwtPayload>).apellido;
      clienteRepo.findById.mockResolvedValue(makeCliente('Beta SA'));
      membresiaRepo.findActivaByUsuarioYCliente.mockResolvedValue(makeMembresiaResuelta());

      let captured: JwtPayload | undefined;
      tokenService.signJwt.mockImplementation((p) => {
        captured = p;
        return 'new.access.token';
      });

      await useCase.execute({ actor, clienteId: 'cliente-2' });

      expect(captured!.nombre).toBe('');
      expect(captured!.apellido).toBe('');
    });
  });
});
