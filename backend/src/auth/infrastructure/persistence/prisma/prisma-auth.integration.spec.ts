/**
 * prisma-auth.integration.spec.ts — TDD RED phase (T5.5, PR5).
 *
 * End-to-end de login/refresh/logout/switch (R3–R9) con los USE CASES reales
 * (PR3/PR4) wireados contra los repos Prisma reales de este PR (T5.3/T5.4) y
 * Postgres REAL (soporte_master_test) — sin mocks de infraestructura.
 *
 * A diferencia de `prisma-auth-repos.integration.spec.ts` (que ejercita cada
 * repo de forma aislada), este archivo valida el CONTRATO completo de
 * autenticación de punta a punta: LoginUseCase → RefreshTokenUseCase →
 * LogoutUseCase/LogoutAllUseCase → SwitchTenantUseCase, con Argon2HashProvider
 * y JwtTokenService reales (no fakes).
 */
import * as crypto from 'crypto';
import { PrismaService } from '../../../../shared/infrastructure/persistence/prisma.service';
import { MasterPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { PrismaClienteRepository } from '../../../../clientes/infrastructure/persistence/prisma/prisma-cliente.repository';
import { PrismaUsuarioRepository } from './prisma-usuario.repository';
import { PrismaMembresiaRepository } from './prisma-membresia.repository';
import { PrismaRefreshTokenRepository } from './prisma-refresh-token.repository';
import { ClienteEntity } from '../../../../clientes/domain/entities/cliente.entity';
import { UsuarioEntity } from '../../../domain/entities/usuario.entity';
import { RoleEntity } from '../../../domain/entities/role.entity';
import { PermisoEntity } from '../../../domain/entities/permiso.entity';
import { Argon2HashProvider } from '../../argon2-hash.provider';
import { JwtService } from '@nestjs/jwt';
import { JwtTokenService } from '../../jwt-token.service';
import { ILogger } from '../../../../shared/domain/ports/i-logger.port';
import { LoginUseCase } from '../../../application/use-cases/login.use-case';
import { RefreshTokenUseCase } from '../../../application/use-cases/refresh-token.use-case';
import { LogoutUseCase } from '../../../application/use-cases/logout.use-case';
import { LogoutAllUseCase } from '../../../application/use-cases/logout-all.use-case';
import { SwitchTenantUseCase } from '../../../application/use-cases/switch-tenant.use-case';
import { JwtPayload } from '../../../domain/ports/i-token.service';

const TEST_DB_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const JWT_SECRET = 'integration-test-secret';
const PLAINTEXT_PASSWORD = 'Sup3rS3cret!';

/** Stub de ILogger — no valida NestJS Logger real, solo captura la auditoría. */
class TestLogger implements ILogger {
  readonly messages: string[] = [];
  log(message: string): void {
    this.messages.push(message);
  }
}

describe('Auth Use Cases — Integration end-to-end (T5.5)', () => {
  let prismaService: PrismaService;
  let masterClient: InstanceType<typeof MasterPrismaClient>;
  let clienteRepo: PrismaClienteRepository;
  let usuarioRepo: PrismaUsuarioRepository;
  let membresiaRepo: PrismaMembresiaRepository;
  let refreshTokenRepo: PrismaRefreshTokenRepository;
  let hashProvider: Argon2HashProvider;
  let tokenService: JwtTokenService;
  let logger: TestLogger;

  let loginUseCase: LoginUseCase;
  let refreshTokenUseCase: RefreshTokenUseCase;
  let logoutUseCase: LogoutUseCase;
  let logoutAllUseCase: LogoutAllUseCase;
  let switchTenantUseCase: SwitchTenantUseCase;

  beforeAll(() => {
    prismaService = new PrismaService(TEST_DB_URL);
    masterClient = prismaService.getMasterClient();
    clienteRepo = new PrismaClienteRepository(prismaService);
    usuarioRepo = new PrismaUsuarioRepository(prismaService);
    membresiaRepo = new PrismaMembresiaRepository(prismaService);
    refreshTokenRepo = new PrismaRefreshTokenRepository(prismaService);
    hashProvider = new Argon2HashProvider();
    tokenService = new JwtTokenService(
      new JwtService({ secret: JWT_SECRET, signOptions: { expiresIn: '15m', algorithm: 'HS256' } }),
    );

    loginUseCase = new LoginUseCase(
      usuarioRepo,
      membresiaRepo,
      clienteRepo,
      hashProvider,
      tokenService,
      refreshTokenRepo,
    );
    refreshTokenUseCase = new RefreshTokenUseCase(
      refreshTokenRepo,
      usuarioRepo,
      membresiaRepo,
      clienteRepo,
      tokenService,
    );
    logoutUseCase = new LogoutUseCase(refreshTokenRepo);
    logoutAllUseCase = new LogoutAllUseCase(refreshTokenRepo);
  });

  beforeEach(() => {
    logger = new TestLogger();
    switchTenantUseCase = new SwitchTenantUseCase(membresiaRepo, clienteRepo, tokenService, logger);
  });

  afterAll(async () => {
    await prismaService.onModuleDestroy();
  });

  beforeEach(async () => {
    await masterClient.$executeRawUnsafe(
      'TRUNCATE TABLE membresias, refresh_tokens, roles_permisos, usuarios, clientes, roles, permisos RESTART IDENTITY CASCADE',
    );
  });

  // ─── Fixtures ─────────────────────────────────────────────────────────

  async function createCliente(suffix: string, activo = true): Promise<ClienteEntity> {
    const cliente = ClienteEntity.create({
      nombre: `E2E Cliente ${suffix}`,
      razonSocial: null,
      cuit: null,
      dbName: `test_e2e_${suffix}`,
      activo,
    });
    await clienteRepo.save(cliente);
    return cliente;
  }

  async function createRoleConPermisos(
    codigo: string,
    permisoCodigos: string[],
  ): Promise<RoleEntity> {
    const permisos = permisoCodigos.map((c) =>
      PermisoEntity.create({ codigo: c, descripcion: null }),
    );
    const role = RoleEntity.create({ codigo, nombre: codigo, descripcion: null, permisos });

    await masterClient.role.create({
      data: { id: role.id, codigo: role.codigo, nombre: role.nombre },
    });
    for (const permiso of permisos) {
      await masterClient.permiso.upsert({
        where: { codigo: permiso.codigo },
        create: { id: permiso.id, codigo: permiso.codigo },
        update: {},
      });
      const permisoRow = await masterClient.permiso.findUniqueOrThrow({
        where: { codigo: permiso.codigo },
      });
      await masterClient.rolesPermisos.create({
        data: { rolId: role.id, permisoId: permisoRow.id },
      });
    }
    return role;
  }

  async function createUsuario(
    suffix: string,
    overrides: Partial<{ isGlobalAdmin: boolean }> = {},
  ): Promise<UsuarioEntity> {
    const usuario = UsuarioEntity.create({
      email: `e2e_${suffix}@integration.test`,
      nombre: 'E2E',
      apellido: 'User',
      passwordHash: await hashProvider.hash(PLAINTEXT_PASSWORD),
      activo: true,
      isGlobalAdmin: overrides.isGlobalAdmin ?? false,
    });
    await usuarioRepo.save(usuario);
    return usuario;
  }

  async function createMembresia(
    usuarioId: string,
    clienteId: string,
    rolId: string,
    activo = true,
  ) {
    await masterClient.membresia.create({ data: { usuarioId, clienteId, rolId, activo } });
  }

  // ─── R3, R4, R6, R7 — Login ─────────────────────────────────────────────

  describe('LoginUseCase (R3, R4, R5, R6, R7)', () => {
    it('usuario con 1 membresía activa → auto-selecciona y emite tokens scopeados', async () => {
      const cliente = await createCliente('login-1m');
      const role = await createRoleConPermisos('TECNICO', ['ticket:editar', 'ticket:crear']);
      const usuario = await createUsuario('login-1m');
      await createMembresia(usuario.id, cliente.id, role.id);

      const result = await loginUseCase.execute({
        email: usuario.email,
        password: PLAINTEXT_PASSWORD,
      });

      expect(result.isOk()).toBe(true);
      const value = result.getValue();
      expect(value.kind).toBe('tokens');
      if (value.kind !== 'tokens') throw new Error('expected tokens');

      const payload = tokenService.verifyJwt(value.accessToken) as JwtPayload;
      expect(payload).not.toBeNull();
      expect(payload.sub).toBe(usuario.id);
      expect(payload.cliente_id).toBe(cliente.id);
      expect(payload.rol).toBe('TECNICO');
      expect(payload.permisos.sort()).toEqual(['ticket:crear', 'ticket:editar']);
      expect(payload.is_global_admin).toBe(false);
      expect(payload.cliente_nombre).toBe(cliente.nombre);
      expect(payload.membresias).toHaveLength(1);

      // R7: el refresh crudo persiste solo su SHA-256, nunca en claro
      const found = await refreshTokenRepo.findByHash(
        crypto.createHash('sha256').update(value.refreshToken).digest('hex'),
      );
      expect(found).not.toBeNull();
      expect(found!.usuarioId).toBe(usuario.id);
      expect(found!.clienteId).toBe(cliente.id);
    });

    it('password incorrecto → 401 CredencialesInvalidas', async () => {
      const usuario = await createUsuario('login-badpass');

      const result = await loginUseCase.execute({
        email: usuario.email,
        password: 'wrong-password',
      });

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('AUTH_INVALID_CREDENTIALS');
    });

    it('usuario inexistente → 401 CredencialesInvalidas (mismo error, sin filtrar existencia)', async () => {
      const result = await loginUseCase.execute({
        email: 'no-existe@integration.test',
        password: PLAINTEXT_PASSWORD,
      });

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('AUTH_INVALID_CREDENTIALS');
    });

    it('usuario normal con 0 membresías activas → 403 SinMembresiaActiva', async () => {
      const usuario = await createUsuario('login-0m');

      const result = await loginUseCase.execute({
        email: usuario.email,
        password: PLAINTEXT_PASSWORD,
      });

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('AUTH_SIN_MEMBRESIA_ACTIVA');
    });

    it('usuario normal con >1 membresías → selection sin emitir tokens, luego login con clienteId', async () => {
      const clienteA = await createCliente('login-multi-a');
      const clienteB = await createCliente('login-multi-b');
      const roleA = await createRoleConPermisos('TECNICO', ['ticket:editar']);
      const roleB = await createRoleConPermisos('USUARIO', ['ticket:crear']);
      const usuario = await createUsuario('login-multi');
      await createMembresia(usuario.id, clienteA.id, roleA.id);
      await createMembresia(usuario.id, clienteB.id, roleB.id);

      const selectionResult = await loginUseCase.execute({
        email: usuario.email,
        password: PLAINTEXT_PASSWORD,
      });

      expect(selectionResult.isOk()).toBe(true);
      const selectionValue = selectionResult.getValue();
      expect(selectionValue.kind).toBe('selection');
      if (selectionValue.kind !== 'selection') throw new Error('expected selection');
      expect(selectionValue.membresias).toHaveLength(2);

      // R5: re-postea con clienteId elegido
      const chosen = await loginUseCase.execute({
        email: usuario.email,
        password: PLAINTEXT_PASSWORD,
        clienteId: clienteA.id,
      });
      expect(chosen.isOk()).toBe(true);
      const chosenValue = chosen.getValue();
      expect(chosenValue.kind).toBe('tokens');
    });

    it('root sin clienteId → token MASTER (cliente_id/rol null, permisos [])', async () => {
      const root = await createUsuario('login-root', { isGlobalAdmin: true });

      const result = await loginUseCase.execute({
        email: root.email,
        password: PLAINTEXT_PASSWORD,
      });

      expect(result.isOk()).toBe(true);
      const value = result.getValue();
      if (value.kind !== 'tokens') throw new Error('expected tokens');

      const payload = tokenService.verifyJwt(value.accessToken) as JwtPayload;
      expect(payload.cliente_id).toBeNull();
      expect(payload.rol).toBeNull();
      expect(payload.permisos).toEqual([]);
      expect(payload.is_global_admin).toBe(true);
    });

    it('clienteId provisto sin membresía → 403 ClienteNoAutorizado (R5)', async () => {
      const cliente = await createCliente('login-no-autorizado');
      const usuario = await createUsuario('login-no-autorizado');

      const result = await loginUseCase.execute({
        email: usuario.email,
        password: PLAINTEXT_PASSWORD,
        clienteId: cliente.id,
      });

      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('AUTH_CLIENTE_NO_AUTORIZADO');
    });

    it('root con clienteId de cualquier cliente activo → token scopeado (R5)', async () => {
      const cliente = await createCliente('login-root-scoped');
      const root = await createUsuario('login-root-scoped', { isGlobalAdmin: true });

      const result = await loginUseCase.execute({
        email: root.email,
        password: PLAINTEXT_PASSWORD,
        clienteId: cliente.id,
      });

      expect(result.isOk()).toBe(true);
      const value = result.getValue();
      if (value.kind !== 'tokens') throw new Error('expected tokens');
      const payload = tokenService.verifyJwt(value.accessToken) as JwtPayload;
      expect(payload.cliente_id).toBe(cliente.id);
      expect(payload.rol).toBeNull();
      expect(payload.permisos).toEqual([]);
      expect(payload.is_global_admin).toBe(true);
    });
  });

  // ─── R8 — Refresh con rotación y re-scope ──────────────────────────────

  describe('RefreshTokenUseCase (R8)', () => {
    it('refresh feliz → rota tokens y re-emite el mismo scope', async () => {
      const cliente = await createCliente('refresh-happy');
      const role = await createRoleConPermisos('TECNICO', ['ticket:editar']);
      const usuario = await createUsuario('refresh-happy');
      await createMembresia(usuario.id, cliente.id, role.id);

      const loginResult = await loginUseCase.execute({
        email: usuario.email,
        password: PLAINTEXT_PASSWORD,
      });
      const loginValue = loginResult.getValue();
      if (loginValue.kind !== 'tokens') throw new Error('expected tokens');

      const refreshResult = await refreshTokenUseCase.execute({
        rawToken: loginValue.refreshToken,
      });

      expect(refreshResult.isOk()).toBe(true);
      const refreshValue = refreshResult.getValue();
      expect(refreshValue.refreshToken).not.toBe(loginValue.refreshToken);

      const payload = tokenService.verifyJwt(refreshValue.accessToken) as JwtPayload;
      expect(payload.cliente_id).toBe(cliente.id);
      expect(payload.rol).toBe('TECNICO');

      // El token anterior queda revocado (rotación incondicional)
      const oldHash = crypto.createHash('sha256').update(loginValue.refreshToken).digest('hex');
      const oldToken = await refreshTokenRepo.findByHash(oldHash);
      expect(oldToken!.isRevoked()).toBe(true);
    });

    it('token inexistente → 401 TokenInvalido', async () => {
      const result = await refreshTokenUseCase.execute({ rawToken: 'no-existe-este-token' });
      expect(result.isFail()).toBe(true);
      expect(result.getError().code).toBe('AUTH_TOKEN_INVALIDO');
    });

    it('token ya revocado (reuse tras rotación) → 401 TokenRevocado', async () => {
      const usuario = await createUsuario('refresh-revoked');
      const loginResult = await loginUseCase.execute({
        email: usuario.email,
        password: PLAINTEXT_PASSWORD,
      });
      // Root para simplificar: no requiere membresía para emitir tokens.
      const rootUsuario = await createUsuario('refresh-revoked-root', { isGlobalAdmin: true });
      const rootLogin = await loginUseCase.execute({
        email: rootUsuario.email,
        password: PLAINTEXT_PASSWORD,
      });
      const rootValue = rootLogin.getValue();
      if (rootValue.kind !== 'tokens') throw new Error('expected tokens');

      // Primera rotación consume el token
      await refreshTokenUseCase.execute({ rawToken: rootValue.refreshToken });
      // Reuso del mismo token crudo ya revocado
      const reuseResult = await refreshTokenUseCase.execute({ rawToken: rootValue.refreshToken });

      expect(reuseResult.isFail()).toBe(true);
      expect(reuseResult.getError().code).toBe('AUTH_TOKEN_REVOCADO');
      // Sanity: el primer login (no root) no interfiere
      expect(loginResult.isFail()).toBe(true); // usuario normal sin membresías
    });

    it('cliente del scope embebido inactivo → 403 ClienteNoAutorizado al refrescar', async () => {
      const cliente = await createCliente('refresh-cliente-suspendido');
      const role = await createRoleConPermisos('TECNICO', ['ticket:editar']);
      const usuario = await createUsuario('refresh-cliente-suspendido');
      await createMembresia(usuario.id, cliente.id, role.id);

      const loginResult = await loginUseCase.execute({
        email: usuario.email,
        password: PLAINTEXT_PASSWORD,
      });
      const loginValue = loginResult.getValue();
      if (loginValue.kind !== 'tokens') throw new Error('expected tokens');

      // Suspende el cliente DESPUÉS de emitido el refresh (Opción B: el
      // clienteId ya está embebido, la re-validación ocurre en el refresh).
      cliente.suspend();
      await clienteRepo.save(cliente);

      const refreshResult = await refreshTokenUseCase.execute({
        rawToken: loginValue.refreshToken,
      });

      expect(refreshResult.isFail()).toBe(true);
      expect(refreshResult.getError().code).toBe('AUTH_CLIENTE_NO_AUTORIZADO');
    });
  });

  // ─── R9 — Logout / logout-all ───────────────────────────────────────────

  describe('LogoutUseCase + LogoutAllUseCase (R9)', () => {
    it('logout revoca el refresh token actual', async () => {
      const root = await createUsuario('logout-single', { isGlobalAdmin: true });
      const loginResult = await loginUseCase.execute({
        email: root.email,
        password: PLAINTEXT_PASSWORD,
      });
      const value = loginResult.getValue();
      if (value.kind !== 'tokens') throw new Error('expected tokens');

      const logoutResult = await logoutUseCase.execute({ rawToken: value.refreshToken });
      expect(logoutResult.isOk()).toBe(true);

      const hash = crypto.createHash('sha256').update(value.refreshToken).digest('hex');
      const found = await refreshTokenRepo.findByHash(hash);
      expect(found!.isRevoked()).toBe(true);
    });

    it('logout-all revoca todos los refresh tokens del usuario', async () => {
      const root = await createUsuario('logout-all', { isGlobalAdmin: true });
      const login1 = await loginUseCase.execute({
        email: root.email,
        password: PLAINTEXT_PASSWORD,
      });
      const login2 = await loginUseCase.execute({
        email: root.email,
        password: PLAINTEXT_PASSWORD,
      });
      const v1 = login1.getValue();
      const v2 = login2.getValue();
      if (v1.kind !== 'tokens' || v2.kind !== 'tokens') throw new Error('expected tokens');

      await logoutAllUseCase.execute({ usuarioId: root.id });

      const found1 = await refreshTokenRepo.findByHash(
        crypto.createHash('sha256').update(v1.refreshToken).digest('hex'),
      );
      const found2 = await refreshTokenRepo.findByHash(
        crypto.createHash('sha256').update(v2.refreshToken).digest('hex'),
      );
      expect(found1!.isRevoked()).toBe(true);
      expect(found2!.isRevoked()).toBe(true);
    });
  });

  // ─── R10 — Switch tenant ────────────────────────────────────────────────

  describe('SwitchTenantUseCase (R10)', () => {
    it('root salta a cualquier cliente activo y audita el salto', async () => {
      const cliente = await createCliente('switch-root');
      const root = await createUsuario('switch-root', { isGlobalAdmin: true });
      const loginResult = await loginUseCase.execute({
        email: root.email,
        password: PLAINTEXT_PASSWORD,
      });
      const value = loginResult.getValue();
      if (value.kind !== 'tokens') throw new Error('expected tokens');
      const actorPayload = tokenService.verifyJwt(value.accessToken) as JwtPayload;

      const switchResult = await switchTenantUseCase.execute({
        actor: actorPayload,
        clienteId: cliente.id,
      });

      expect(switchResult.isOk()).toBe(true);
      const newPayload = tokenService.verifyJwt(switchResult.getValue().accessToken) as JwtPayload;
      expect(newPayload.cliente_id).toBe(cliente.id);
      expect(logger.messages).toHaveLength(1);
      expect(logger.messages[0]).toContain('SWITCH TENANT');
      expect(logger.messages[0]).toContain(`usuario=${root.id}`);
      expect(logger.messages[0]).toContain(`to=${cliente.id}`);
    });

    it('usuario normal sin membresía en el cliente destino → 403 ClienteNoAutorizado', async () => {
      const clienteOrigen = await createCliente('switch-origen');
      const clienteDestino = await createCliente('switch-destino');
      const role = await createRoleConPermisos('TECNICO', ['ticket:editar']);
      const usuario = await createUsuario('switch-sin-permiso');
      await createMembresia(usuario.id, clienteOrigen.id, role.id);

      const loginResult = await loginUseCase.execute({
        email: usuario.email,
        password: PLAINTEXT_PASSWORD,
      });
      const value = loginResult.getValue();
      if (value.kind !== 'tokens') throw new Error('expected tokens');
      const actorPayload = tokenService.verifyJwt(value.accessToken) as JwtPayload;

      const switchResult = await switchTenantUseCase.execute({
        actor: actorPayload,
        clienteId: clienteDestino.id,
      });

      expect(switchResult.isFail()).toBe(true);
      expect(switchResult.getError().code).toBe('AUTH_CLIENTE_NO_AUTORIZADO');
      expect(logger.messages).toHaveLength(0); // no se audita un intento rechazado
    });

    it('NO rota el refresh token (el refresh original sigue vigente tras el switch)', async () => {
      const clienteA = await createCliente('switch-no-rota-a');
      const clienteB = await createCliente('switch-no-rota-b');
      const role = await createRoleConPermisos('TECNICO', ['ticket:editar']);
      const usuario = await createUsuario('switch-no-rota');
      await createMembresia(usuario.id, clienteA.id, role.id);
      await createMembresia(usuario.id, clienteB.id, role.id);

      // Usuario tiene 2 membresías activas → login sin clienteId devolvería
      // 'selection' (R4); se selecciona clienteA explícitamente (R5) para
      // obtener tokens directamente.
      const loginResult = await loginUseCase.execute({
        email: usuario.email,
        password: PLAINTEXT_PASSWORD,
        clienteId: clienteA.id,
      });
      const value = loginResult.getValue();
      if (value.kind !== 'tokens') throw new Error('expected tokens');
      const actorPayload = tokenService.verifyJwt(value.accessToken) as JwtPayload;

      await switchTenantUseCase.execute({ actor: actorPayload, clienteId: clienteB.id });

      // El refresh original (emitido en el login, scopeado a clienteA) sigue
      // sirviendo para refrescar — el switch no lo tocó.
      const refreshResult = await refreshTokenUseCase.execute({ rawToken: value.refreshToken });
      expect(refreshResult.isOk()).toBe(true);
      const payload = tokenService.verifyJwt(refreshResult.getValue().accessToken) as JwtPayload;
      expect(payload.cliente_id).toBe(clienteA.id); // el refresh mantiene el scope ORIGINAL
    });
  });
});
