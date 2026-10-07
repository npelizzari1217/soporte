/**
 * T4.6–T4.8 TEST — Unit tests de SwitchTenantUseCase (RED → GREEN)
 *
 * Cubre (R10):
 * - Root → cualquier cliente activo no borrado es válido.
 * - Root con membresía en ese cliente → rol/permisos de la membresía.
 * - Root sin membresía en ese cliente → rol=null/permisos=[], igual autorizado.
 * - Normal → clienteId DEBE tener membresía activa; sin ella → 403
 *   ClienteNoAutorizado.
 * - Emite SOLO el access token (no ROTA el refresh — ver más abajo, fix
 *   #168, que SÍ actualiza su scope en el lugar).
 * - Audita el salto vía ILogger.log con formato exacto
 *   `SWITCH TENANT | usuario={sub} | from={cliente_id} | to={clienteId} | at={ISO}`.
 * - El nuevo payload incluye membresias[] completo (consistencia con
 *   login/refresh — ADR-3).
 * - fix #168: si `dto.refreshToken` viene, actualiza (sin rotar) el
 *   `clienteId` del refresh token vigente — así `RefreshTokenUseCase` no
 *   revive el scope de la emisión original tras el switch.
 */
import * as crypto from 'crypto';
import type { Mocked } from 'vitest';
import { SwitchTenantUseCase, SwitchTenantDto } from './switch-tenant.use-case';
import { ClienteEntity } from '../../../clientes/domain/entities/cliente.entity';
import { RefreshTokenEntity } from '../../domain/entities/refresh-token.entity';
import { IMembresiaRepository, MembresiaResuelta } from '../../domain/ports/i-membresia.repository';
import { IMatrizPermisosRepository } from '../../domain/ports/i-matriz-permisos.repository';
import { IClienteRepository } from '../../../clientes/domain/ports/i-cliente.repository';
import { IRefreshTokenRepository } from '../../domain/ports/i-refresh-token.repository';
import { ITokenService, JwtPayload } from '../../domain/ports/i-token.service';
import { ILogger } from '../../../shared/domain/ports/i-logger.port';
import { ClienteNoAutorizadoError } from '../../domain/errors/auth.errors';
import { payloadDeTest } from '../../test-helpers/payload-de-test';
import { PARES_VALIDOS } from '../../../shared/domain/acciones';
import { unstubbed } from '../../../testing/mocks';

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
  clienteRequiere2fa: false,
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
  // SwitchTenantUseCase nunca crea/muta membresías, solo las lee vía
  // resolverScope: un stub mudo taparía que producción empiece a llamarlos.
  findActivasByCliente: unstubbed('findActivasByCliente'),
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

const makeTokenService = (): Mocked<ITokenService> => ({
  signJwt: vi.fn().mockReturnValue('new.access.token'),
  verifyJwt: vi.fn().mockReturnValue(null),
});

const makeLogger = (): Mocked<ILogger> => ({
  log: vi.fn(),
  // Desde el fix #168 SÍ llama a error(): es la degradación silenciosa cuando
  // no se puede persistir el scope del refresh token. Hasta entonces esto era
  // `unstubbed('ILogger.error')` justamente para que, si producción empezaba a
  // llamarlo, ningún test lo tapara — y funcionó: el mock explotó al agregar
  // el `try/catch`, que es cómo se descubrió que había que actualizar esta
  // nota. Los dos tests gemelos de más abajo fijan que se llama.
  error: vi.fn(),
});

const makePermisosRepo = (): Mocked<IMatrizPermisosRepository> => ({
  findByUsuarioYCliente: vi.fn().mockResolvedValue([]),
  setPermisos: vi.fn().mockResolvedValue(undefined),
});

const makeRefreshTokenRepo = (): Mocked<IRefreshTokenRepository> => ({
  findByHash: vi.fn().mockResolvedValue(null),
  revokeAllByUsuarioId: unstubbed('revokeAllByUsuarioId'),
  save: vi.fn().mockResolvedValue(undefined),
});

const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

const makeRefreshTokenEntity = (
  overrides: Partial<{
    usuarioId: string;
    tokenHash: string;
    expiresAt: Date;
    revokedAt: Date | null;
    clienteId: string | null;
  }> = {},
): RefreshTokenEntity =>
  RefreshTokenEntity.create({
    usuarioId: overrides.usuarioId ?? 'usuario-1',
    tokenHash: overrides.tokenHash ?? 'hash-de-test',
    expiresAt: overrides.expiresAt ?? future,
    revokedAt: overrides.revokedAt ?? null,
    clienteId: 'clienteId' in overrides ? (overrides.clienteId as string | null) : null,
  });

describe('SwitchTenantUseCase', () => {
  let membresiaRepo: Mocked<IMembresiaRepository>;
  let clienteRepo: Mocked<IClienteRepository>;
  let tokenService: Mocked<ITokenService>;
  let logger: Mocked<ILogger>;
  let permisosRepo: Mocked<IMatrizPermisosRepository>;
  let refreshTokenRepo: Mocked<IRefreshTokenRepository>;
  let useCase: SwitchTenantUseCase;

  beforeEach(() => {
    membresiaRepo = makeMembresiaRepo();
    clienteRepo = makeClienteRepo();
    tokenService = makeTokenService();
    logger = makeLogger();
    permisosRepo = makePermisosRepo();
    refreshTokenRepo = makeRefreshTokenRepo();
    useCase = new SwitchTenantUseCase(
      membresiaRepo,
      clienteRepo,
      tokenService,
      logger,
      permisosRepo,
      refreshTokenRepo,
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

    it('propaga cliente_logo_v desde resolverScope al saltar de cliente (sdd/logo-por-cliente, WU3)', async () => {
      const actor = makeActorPayload({ is_global_admin: true });
      const cliente = makeCliente('Beta SA');
      const logoUpdatedAt = new Date('2026-06-15T00:00:00.000Z');
      cliente.actualizarLogo('clientes/cliente-2/logo.png', 'image/png', logoUpdatedAt);
      clienteRepo.findById.mockResolvedValue(cliente);
      membresiaRepo.findActivaByUsuarioYCliente.mockResolvedValue(makeMembresiaResuelta());

      let captured: JwtPayload | undefined;
      tokenService.signJwt.mockImplementation((p) => {
        captured = p;
        return 'new.access.token';
      });

      await useCase.execute({ actor, clienteId: 'cliente-2' });

      expect(captured!.cliente_logo_v).toBe(logoUpdatedAt.getTime());
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
    it('el constructor toma exactamente 6 puertos (fix #168 agrega IRefreshTokenRepository — actualiza el scope del refresh, no lo rota)', () => {
      expect(useCase).toBeInstanceOf(SwitchTenantUseCase);
      expect(SwitchTenantUseCase.length).toBe(6);
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

  describe('Persistencia del scope en el refresh token vigente (fix #168)', () => {
    const rawRefreshToken = 'r'.repeat(64);
    const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');

    it('actualiza (sin rotar) el clienteId del refresh vigente cuando el switch es autorizado', async () => {
      const actor = makeActorPayload({ sub: 'usuario-1', is_global_admin: false });
      clienteRepo.findById.mockResolvedValue(makeCliente('Beta SA'));
      membresiaRepo.findActivaByUsuarioYCliente.mockResolvedValue(makeMembresiaResuelta());
      const tokenVigente = makeRefreshTokenEntity({
        usuarioId: 'usuario-1',
        tokenHash,
        clienteId: 'cliente-1',
      });
      refreshTokenRepo.findByHash.mockResolvedValue(tokenVigente);

      const dto: SwitchTenantDto = {
        actor,
        clienteId: 'cliente-2',
        refreshToken: rawRefreshToken,
      };
      const result = await useCase.execute(dto);

      expect(result.isOk()).toBe(true);
      expect(refreshTokenRepo.findByHash).toHaveBeenCalledWith(tokenHash);
      expect(refreshTokenRepo.save).toHaveBeenCalledWith(tokenVigente);
      // Mismo token (misma entidad, mismo hash) — NO es una rotación.
      expect(tokenVigente.tokenHash).toBe(tokenHash);
      expect(tokenVigente.clienteId).toBe('cliente-2');
    });

    it('el usuario que cambia de cliente varias veces queda, tras cada switch, en el ÚLTIMO elegido', async () => {
      const actor = makeActorPayload({ sub: 'usuario-1', is_global_admin: false });
      clienteRepo.findById.mockResolvedValue(makeCliente('Beta SA'));
      membresiaRepo.findActivaByUsuarioYCliente.mockResolvedValue(makeMembresiaResuelta());
      const tokenVigente = makeRefreshTokenEntity({
        usuarioId: 'usuario-1',
        tokenHash,
        clienteId: null,
      });
      refreshTokenRepo.findByHash.mockResolvedValue(tokenVigente);

      await useCase.execute({ actor, clienteId: 'cliente-1', refreshToken: rawRefreshToken });
      expect(tokenVigente.clienteId).toBe('cliente-1');

      await useCase.execute({ actor, clienteId: 'cliente-2', refreshToken: rawRefreshToken });
      expect(tokenVigente.clienteId).toBe('cliente-2'); // el último, no el anterior
    });

    it('EL GEMELO INVERTIDO — switch rechazado por falta de membresía → el refresh NUNCA se toca', async () => {
      const actor = makeActorPayload({ sub: 'usuario-1', is_global_admin: false });
      clienteRepo.findById.mockResolvedValue(makeCliente('Beta SA'));
      membresiaRepo.findActivaByUsuarioYCliente.mockResolvedValue(null);

      const result = await useCase.execute({
        actor,
        clienteId: 'cliente-2',
        refreshToken: rawRefreshToken,
      });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(ClienteNoAutorizadoError);
      // La persistencia arreglada NO puede convertirse en persistir una
      // autorización que nunca existió: si resolverScope rechaza, el
      // refresh token ni se busca.
      expect(refreshTokenRepo.findByHash).not.toHaveBeenCalled();
      expect(refreshTokenRepo.save).not.toHaveBeenCalled();
    });

    it('sin refreshToken en el dto (compat con BFF pre-fix) → no toca IRefreshTokenRepository, el switch igual funciona', async () => {
      const actor = makeActorPayload({ is_global_admin: false });
      clienteRepo.findById.mockResolvedValue(makeCliente('Beta SA'));
      membresiaRepo.findActivaByUsuarioYCliente.mockResolvedValue(makeMembresiaResuelta());

      const result = await useCase.execute({ actor, clienteId: 'cliente-2' });

      expect(result.isOk()).toBe(true);
      expect(refreshTokenRepo.findByHash).not.toHaveBeenCalled();
      expect(refreshTokenRepo.save).not.toHaveBeenCalled();
    });

    /**
     * EL BLOQUE ES BEST-EFFORT Y NO PUEDE VOLTEAR EL SWITCH — y las guardas
     * lógicas no alcanzan para garantizarlo.
     *
     * `findByHash` y `save` van a la BASE: una base caída LANZA, no devuelve
     * falso, así que sale por afuera de todo `if`. Sin el `try/catch`, este
     * fix —que existe para que el tenant no se pierda— impediría ELEGIRLO:
     * un hipo en `refresh_tokens`, una tabla que antes del #168 ni
     * participaba del switch, voltearía la operación entera.
     *
     * Los dos tests de abajo son gemelos: uno cubre la lectura y otro la
     * escritura, porque un `try` mal puesto puede cubrir una y dejar la otra
     * afuera. El peor caso aceptado es volver al comportamiento previo al
     * fix: el scope no se actualiza y el tenant se pierde al renovar.
     */
    it('si findByHash LANZA → el switch igual responde OK y se registra la degradación', async () => {
      const actor = makeActorPayload({ is_global_admin: false });
      clienteRepo.findById.mockResolvedValue(makeCliente('Beta SA'));
      membresiaRepo.findActivaByUsuarioYCliente.mockResolvedValue(makeMembresiaResuelta());
      refreshTokenRepo.findByHash.mockRejectedValue(new Error('conexión caída'));

      const result = await useCase.execute({
        actor,
        clienteId: 'cliente-2',
        refreshToken: rawRefreshToken,
      });

      expect(result.isOk()).toBe(true);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('no se pudo persistir el scope del refresh token'),
      );
    });

    it('si save LANZA → el switch igual responde OK y se registra la degradación', async () => {
      const actor = makeActorPayload({ sub: 'usuario-1', is_global_admin: false });
      clienteRepo.findById.mockResolvedValue(makeCliente('Beta SA'));
      membresiaRepo.findActivaByUsuarioYCliente.mockResolvedValue(makeMembresiaResuelta());
      refreshTokenRepo.findByHash.mockResolvedValue(
        makeRefreshTokenEntity({ usuarioId: 'usuario-1', tokenHash }),
      );
      refreshTokenRepo.save.mockRejectedValue(new Error('deadlock'));

      const result = await useCase.execute({
        actor,
        clienteId: 'cliente-2',
        refreshToken: rawRefreshToken,
      });

      expect(result.isOk()).toBe(true);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('no se pudo persistir el scope del refresh token'),
      );
    });

    it('refreshToken que no matchea ningún hash conocido → no-op, el switch igual responde OK', async () => {
      const actor = makeActorPayload({ is_global_admin: false });
      clienteRepo.findById.mockResolvedValue(makeCliente('Beta SA'));
      membresiaRepo.findActivaByUsuarioYCliente.mockResolvedValue(makeMembresiaResuelta());
      refreshTokenRepo.findByHash.mockResolvedValue(null);

      const result = await useCase.execute({
        actor,
        clienteId: 'cliente-2',
        refreshToken: rawRefreshToken,
      });

      expect(result.isOk()).toBe(true);
      expect(refreshTokenRepo.save).not.toHaveBeenCalled();
    });

    it('refreshToken de OTRO usuario (usuarioId no coincide) → no lo pisa (defensivo)', async () => {
      const actor = makeActorPayload({ sub: 'usuario-1', is_global_admin: false });
      clienteRepo.findById.mockResolvedValue(makeCliente('Beta SA'));
      membresiaRepo.findActivaByUsuarioYCliente.mockResolvedValue(makeMembresiaResuelta());
      const tokenDeOtro = makeRefreshTokenEntity({ usuarioId: 'usuario-ajeno', tokenHash });
      refreshTokenRepo.findByHash.mockResolvedValue(tokenDeOtro);

      const result = await useCase.execute({
        actor,
        clienteId: 'cliente-2',
        refreshToken: rawRefreshToken,
      });

      expect(result.isOk()).toBe(true);
      expect(refreshTokenRepo.save).not.toHaveBeenCalled();
    });

    it('refreshToken ya revocado → no-op (RefreshTokenUseCase ya lo rechaza antes de leer clienteId)', async () => {
      const actor = makeActorPayload({ sub: 'usuario-1', is_global_admin: false });
      clienteRepo.findById.mockResolvedValue(makeCliente('Beta SA'));
      membresiaRepo.findActivaByUsuarioYCliente.mockResolvedValue(makeMembresiaResuelta());
      const tokenRevocado = makeRefreshTokenEntity({
        usuarioId: 'usuario-1',
        tokenHash,
        revokedAt: new Date(),
      });
      refreshTokenRepo.findByHash.mockResolvedValue(tokenRevocado);

      const result = await useCase.execute({
        actor,
        clienteId: 'cliente-2',
        refreshToken: rawRefreshToken,
      });

      expect(result.isOk()).toBe(true);
      expect(refreshTokenRepo.save).not.toHaveBeenCalled();
    });

    it('refreshToken ya expirado → no-op', async () => {
      const actor = makeActorPayload({ sub: 'usuario-1', is_global_admin: false });
      clienteRepo.findById.mockResolvedValue(makeCliente('Beta SA'));
      membresiaRepo.findActivaByUsuarioYCliente.mockResolvedValue(makeMembresiaResuelta());
      const tokenExpirado = makeRefreshTokenEntity({
        usuarioId: 'usuario-1',
        tokenHash,
        expiresAt: new Date(Date.now() - 1000),
      });
      refreshTokenRepo.findByHash.mockResolvedValue(tokenExpirado);

      const result = await useCase.execute({
        actor,
        clienteId: 'cliente-2',
        refreshToken: rawRefreshToken,
      });

      expect(result.isOk()).toBe(true);
      expect(refreshTokenRepo.save).not.toHaveBeenCalled();
    });

    it('persiste SIEMPRE scope.clienteId (ya validado), nunca el dto.clienteId crudo — root sin membresía en el destino', async () => {
      const actor = makeActorPayload({ sub: 'root-1', is_global_admin: true });
      clienteRepo.findById.mockResolvedValue(makeCliente('Beta SA'));
      membresiaRepo.findActivaByUsuarioYCliente.mockResolvedValue(null);
      const tokenVigente = makeRefreshTokenEntity({
        usuarioId: 'root-1',
        tokenHash,
        clienteId: null,
      });
      refreshTokenRepo.findByHash.mockResolvedValue(tokenVigente);

      await useCase.execute({ actor, clienteId: 'cliente-2', refreshToken: rawRefreshToken });

      expect(tokenVigente.clienteId).toBe('cliente-2');
    });
  });
});
