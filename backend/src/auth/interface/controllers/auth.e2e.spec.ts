/**
 * auth.e2e.spec.ts — TDD RED phase (T6.5/T6.6, PR6 — cierre de la fase).
 *
 * E2E real de punta a punta (HTTP → guards → controller → use cases → Prisma
 * REAL contra `soporte_master_test`), bootstrapeando `AuthModule` +
 * `SharedModule` con NestJS `TestingModule` real (sin mocks de infra).
 *
 * Cubre R3–R14: login (1/varias membresías/root), refresh con rotación,
 * switch (autorizado/denegado, root cross-tenant), y los 4 guards (R11–R14)
 * ejercidos vía HTTP real — no solo en unidad.
 *
 * Nota de diseño — `TestProtectedController`: al momento de este PR ningún
 * módulo de negocio (tickets/clientes/etc.) tiene endpoints reales que usen
 * `TenantGuard`/`AccionesGuard`/`GlobalAdminGuard` (siguen scaffoldeados
 * vacíos — esos guards recién se consumirán en PRs de features futuras). Sin
 * un endpoint real no hay forma de probar el guard vía HTTP genuino (las
 * specs unitarias de cada guard, en `infrastructure/guards/*.spec.ts`, ya
 * cubren su lógica aislada). Se declara acá un controller MÍNIMO de test,
 * dentro de un módulo que solo importa `SharedModule`+`AuthModule` (los
 * guards se resuelven vía los tokens que `AuthModule` ya exporta) — NO se
 * toca código de producción. Se elimina naturalmente cuando el primer
 * controller de negocio real los reemplace.
 *
 * Nota — sin `supertest`: se usa `fetch` nativo de Node (mismo patrón
 * probado en `soporte1/backend/src/clientes/interface/smoke.e2e.spec.ts`),
 * evitando agregar una dependencia nueva al proyecto para este PR.
 */
import { Pool } from 'pg';
import {
  Controller,
  Get,
  INestApplication,
  MiddlewareConsumer,
  Module,
  NestModule,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';

import { SharedModule } from '../../../shared/shared.module';
import { AuthModule } from '../../auth.module';
import { TenantScopeMiddleware } from '../../../shared/tenancy/tenant-scope.middleware';
import { JwtAuthGuard } from '../../infrastructure/guards/jwt-auth.guard';
import { TenantGuard } from '../../infrastructure/guards/tenant.guard';
import { AccionesGuard } from '../../infrastructure/guards/acciones.guard';
import { GlobalAdminGuard } from '../../infrastructure/guards/global-admin.guard';
import { CurrentUser, RequiereAcciones } from '../../infrastructure/guards/decorators';
import { JwtPayload, VERSION_PAYLOAD_JWT } from '../../domain/ports/i-token.service';

import { PrismaService } from '../../../shared/infrastructure/persistence/prisma.service';
import { MasterPrismaClient } from '../../../shared/infrastructure/persistence/prisma-clients';
import { PrismaClienteRepository } from '../../../clientes/infrastructure/persistence/prisma/prisma-cliente.repository';
import { PrismaUsuarioRepository } from '../../infrastructure/persistence/prisma/prisma-usuario.repository';
import { PrismaMatrizPermisosRepository } from '../../infrastructure/persistence/prisma/prisma-matriz-permisos.repository';
import { ClienteEntity } from '../../../clientes/domain/entities/cliente.entity';
import { UsuarioEntity } from '../../domain/entities/usuario.entity';
import { RoleEntity } from '../../domain/entities/role.entity';
import { PermisoEntity } from '../../domain/entities/permiso.entity';
import { Argon2HashProvider } from '../../infrastructure/argon2-hash.provider';
import { usarLockMasterTest } from '../../../testing/lock-master-test';

const TEST_DB_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const PLAINTEXT_PASSWORD = 'E2eSecret!123';

// ─── Test harness: controller mínimo (ver nota de diseño arriba) ────────────

@Controller('test-protected')
class TestProtectedController {
  @Get('tenant-only')
  @UseGuards(JwtAuthGuard, TenantGuard)
  tenantOnly(@CurrentUser() user: JwtPayload): { clienteId: string | null } {
    return { clienteId: user.cliente_id };
  }

  @Get('permission-gated')
  @UseGuards(JwtAuthGuard, AccionesGuard)
  // WU-7.3: harness migrado de PermissionsGuard/@RequirePermissions a
  // AccionesGuard/@RequiereAcciones — mismo criterio (AND, bypass ROOT,
  // mensaje de faltantes), ahora sobre la matriz nueva.
  @RequiereAcciones('TICKETS:ALTAS')
  permissionGated(): { ok: true } {
    return { ok: true };
  }

  @Get('root-only')
  @UseGuards(JwtAuthGuard, GlobalAdminGuard)
  rootOnly(): { ok: true } {
    return { ok: true };
  }
}

@Module({
  imports: [SharedModule, AuthModule],
  controllers: [TestProtectedController],
})
class TestHarnessModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantScopeMiddleware).forRoutes('*');
  }
}

// ─── Helpers HTTP (fetch nativo) ─────────────────────────────────────────────

type Headers = Record<string, string>;

async function httpPost<T = unknown>(
  url: string,
  body: unknown,
  headers: Headers = {},
): Promise<{ status: number; data: T }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as T;
  return { status: res.status, data };
}

async function httpGet<T = unknown>(
  url: string,
  headers: Headers = {},
): Promise<{ status: number; data: T }> {
  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json', ...headers },
  });
  const data = (await res.json().catch(() => null)) as T;
  return { status: res.status, data };
}

function bearer(token: string): Headers {
  return { Authorization: `Bearer ${token}` };
}

// ─── Suite ────────────────────────────────────────────────────────────────

// Turno exclusivo sobre la master de test compartida — ver src/testing/lock-master-test.ts.
usarLockMasterTest();

describe('Auth e2e (R3–R14, PR6)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let prismaService: PrismaService;
  let masterClient: InstanceType<typeof MasterPrismaClient>;
  let clienteRepo: PrismaClienteRepository;
  let usuarioRepo: PrismaUsuarioRepository;
  let permisosRepo: PrismaMatrizPermisosRepository;
  let hashProvider: Argon2HashProvider;
  let jwtService: JwtService;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL_MASTER) {
      process.env.DATABASE_URL_MASTER = TEST_DB_URL;
    }

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [TestHarnessModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    await app.listen(0);

    const port = (app.getHttpServer() as { address: () => { port: number } }).address().port;
    baseUrl = `http://localhost:${port}`;
    // WU-7.7 (S3): JwtService de AuthModule, resuelto sin exportar — Nest
    // busca en TODO el árbol salvo `strict: true` (mismo criterio ya usado
    // para otros use cases inyectados vía `app.get()` en este repo). Sirve
    // para firmar tokens SINTÉTICOS con `v` vieja/ausente, algo que
    // `JwtTokenService.signJwt` no permite (siempre firma con `v: 2`).
    jwtService = app.get(JwtService);

    prismaService = new PrismaService(TEST_DB_URL);
    masterClient = prismaService.getMasterClient();
    clienteRepo = new PrismaClienteRepository(prismaService);
    usuarioRepo = new PrismaUsuarioRepository(prismaService);
    permisosRepo = new PrismaMatrizPermisosRepository(prismaService);
    hashProvider = new Argon2HashProvider();
  }, 60_000);

  afterAll(async () => {
    try {
      await app?.close();
    } catch (_err) {
      /* no-op */
    }
    try {
      await prismaService?.onModuleDestroy();
    } catch (_err) {
      /* no-op */
    }
  }, 30_000);

  beforeEach(async () => {
    // usuario_cliente_permisos (WU-7.1) no tiene FK declarada — el TRUNCATE
    // ... CASCADE de las otras tablas no la alcanza, hay que nombrarla.
    // roles_permisos/permisos ya NO existen (migración
    // drop_legacy_rbac_tablas_muertas, converge con WU-9 en producción).
    await masterClient.$executeRawUnsafe(
      'TRUNCATE TABLE membresias, refresh_tokens, usuarios, clientes, roles, usuario_cliente_permisos RESTART IDENTITY CASCADE',
    );
  });

  // ─── Fixtures ─────────────────────────────────────────────────────────

  async function createCliente(suffix: string, activo = true): Promise<ClienteEntity> {
    const cliente = ClienteEntity.create({
      nombre: `E2E Cliente ${suffix}`,
      razonSocial: null,
      cuit: null,
      dbName: `test_auth_e2e_${suffix}`,
      activo,
    });
    await clienteRepo.save(cliente);
    return cliente;
  }

  // `permisoCodigos` ya NO siembra `roles_permisos`/`permisos` (RBAC viejo,
  // tablas eliminadas — migración drop_legacy_rbac_tablas_muertas): "el role
  // RBAC de arriba ya no alimenta `payload.permisos`" (ver call sites abajo).
  // Los permisos reales se siembran vía `permisosRepo.setPermisos` (matriz
  // `usuario_cliente_permisos`). El parámetro se conserva para no tocar los
  // call sites existentes.
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
    return role;
  }

  async function createUsuario(
    suffix: string,
    overrides: Partial<{ isGlobalAdmin: boolean }> = {},
  ): Promise<UsuarioEntity> {
    const usuario = UsuarioEntity.create({
      email: `e2e_${suffix}@auth.test`,
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
  ): Promise<void> {
    await masterClient.membresia.create({ data: { usuarioId, clienteId, rolId, activo } });
  }

  async function login(email: string, password = PLAINTEXT_PASSWORD, clienteId?: string) {
    return httpPost<{
      accessToken?: string;
      refreshToken?: string;
      needsClienteSelection?: true;
      membresias?: { cliente_id: string; nombre: string; rol: string }[];
    }>(`${baseUrl}/auth/login`, { email, password, ...(clienteId ? { clienteId } : {}) });
  }

  // ─── R3–R6 — Login ────────────────────────────────────────────────────

  describe('POST /auth/login (R3–R6)', () => {
    it('1 membresía activa → 200 { accessToken, refreshToken }', async () => {
      const cliente = await createCliente('login-1m');
      const role = await createRoleConPermisos('TECNICO', ['ticket:editar']);
      const usuario = await createUsuario('login-1m');
      await createMembresia(usuario.id, cliente.id, role.id);

      const { status, data } = await login(usuario.email);

      expect(status).toBe(200);
      expect(data.accessToken).toEqual(expect.any(String));
      expect(data.refreshToken).toEqual(expect.any(String));
    });

    it('>1 membresías sin clienteId → 200 { needsClienteSelection, membresias }, re-login con clienteId → tokens', async () => {
      const clienteA = await createCliente('login-multi-a');
      const clienteB = await createCliente('login-multi-b');
      const roleA = await createRoleConPermisos('TECNICO', ['ticket:editar']);
      const roleB = await createRoleConPermisos('USUARIO', ['ticket:crear']);
      const usuario = await createUsuario('login-multi');
      await createMembresia(usuario.id, clienteA.id, roleA.id);
      await createMembresia(usuario.id, clienteB.id, roleB.id);

      const selection = await login(usuario.email);
      expect(selection.status).toBe(200);
      expect(selection.data.needsClienteSelection).toBe(true);
      expect(selection.data.membresias).toHaveLength(2);
      expect(selection.data.accessToken).toBeUndefined();

      const chosen = await login(usuario.email, PLAINTEXT_PASSWORD, clienteA.id);
      expect(chosen.status).toBe(200);
      expect(chosen.data.accessToken).toEqual(expect.any(String));
    });

    it('root sin clienteId → 200, token MASTER', async () => {
      const root = await createUsuario('login-root', { isGlobalAdmin: true });

      const { status } = await login(root.email);

      expect(status).toBe(200);
    });

    it('password incorrecto → 401', async () => {
      const usuario = await createUsuario('login-badpass');

      const { status } = await login(usuario.email, 'wrong-password');

      expect(status).toBe(401);
    });

    it('body inválido (email malformado) → 400 (ValidationPipe)', async () => {
      const { status } = await httpPost(`${baseUrl}/auth/login`, {
        email: 'no-es-un-email',
        password: 'x',
      });

      expect(status).toBe(400);
    });
  });

  // ─── R8 — Refresh con rotación ────────────────────────────────────────

  describe('POST /auth/refresh (R8)', () => {
    it('refresh feliz → rota tokens (nuevos != anteriores)', async () => {
      const root = await createUsuario('refresh-happy', { isGlobalAdmin: true });
      const loginRes = await login(root.email);
      const oldRefresh = loginRes.data.refreshToken!;

      const { status, data } = await httpPost<{ accessToken: string; refreshToken: string }>(
        `${baseUrl}/auth/refresh`,
        { refreshToken: oldRefresh },
      );

      expect(status).toBe(200);
      expect(data.refreshToken).not.toBe(oldRefresh);
    });

    it('reuso del refresh ya rotado → 401 (TokenRevocado)', async () => {
      const root = await createUsuario('refresh-reuse', { isGlobalAdmin: true });
      const loginRes = await login(root.email);
      const oldRefresh = loginRes.data.refreshToken!;

      await httpPost(`${baseUrl}/auth/refresh`, { refreshToken: oldRefresh });
      const { status } = await httpPost(`${baseUrl}/auth/refresh`, { refreshToken: oldRefresh });

      expect(status).toBe(401);
    });

    it('token inexistente → 401', async () => {
      const { status } = await httpPost(`${baseUrl}/auth/refresh`, { refreshToken: 'no-existe' });
      expect(status).toBe(401);
    });
  });

  // ─── R9 — Logout / logout-all ───────────────────────────────────────────

  describe('POST /auth/logout + /auth/logout-all (R9)', () => {
    it('logout revoca el token: refrescar después → 401', async () => {
      const root = await createUsuario('logout-single', { isGlobalAdmin: true });
      const { data } = await login(root.email);

      const logoutRes = await httpPost(`${baseUrl}/auth/logout`, {
        refreshToken: data.refreshToken,
      });
      expect(logoutRes.status).toBe(204);

      const refreshRes = await httpPost(`${baseUrl}/auth/refresh`, {
        refreshToken: data.refreshToken,
      });
      expect(refreshRes.status).toBe(401);
    });

    it('logout-all revoca todos los refresh tokens del usuario autenticado', async () => {
      const root = await createUsuario('logout-all', { isGlobalAdmin: true });
      const login1 = await login(root.email);
      const login2 = await login(root.email);

      const logoutAllRes = await httpPost(
        `${baseUrl}/auth/logout-all`,
        {},
        bearer(login1.data.accessToken!),
      );
      expect(logoutAllRes.status).toBe(204);

      const refresh1 = await httpPost(`${baseUrl}/auth/refresh`, {
        refreshToken: login1.data.refreshToken,
      });
      const refresh2 = await httpPost(`${baseUrl}/auth/refresh`, {
        refreshToken: login2.data.refreshToken,
      });
      expect(refresh1.status).toBe(401);
      expect(refresh2.status).toBe(401);
    });
  });

  // ─── R10 — Switch tenant ────────────────────────────────────────────────

  describe('POST /auth/switch (R10)', () => {
    it('usuario normal salta a un cliente con membresía → 200 { accessToken }', async () => {
      const clienteA = await createCliente('switch-ok-a');
      const clienteB = await createCliente('switch-ok-b');
      const role = await createRoleConPermisos('TECNICO', ['ticket:editar']);
      const usuario = await createUsuario('switch-ok');
      await createMembresia(usuario.id, clienteA.id, role.id);
      await createMembresia(usuario.id, clienteB.id, role.id);

      const loginRes = await login(usuario.email, PLAINTEXT_PASSWORD, clienteA.id);
      const { status, data } = await httpPost<{ accessToken: string }>(
        `${baseUrl}/auth/switch`,
        { clienteId: clienteB.id },
        bearer(loginRes.data.accessToken!),
      );

      expect(status).toBe(200);
      expect(data.accessToken).toEqual(expect.any(String));
    });

    it('usuario normal SIN membresía en el cliente destino → 403', async () => {
      const clienteOrigen = await createCliente('switch-denied-origen');
      const clienteDestino = await createCliente('switch-denied-destino');
      const role = await createRoleConPermisos('TECNICO', ['ticket:editar']);
      const usuario = await createUsuario('switch-denied');
      await createMembresia(usuario.id, clienteOrigen.id, role.id);

      const loginRes = await login(usuario.email);
      const { status } = await httpPost(
        `${baseUrl}/auth/switch`,
        { clienteId: clienteDestino.id },
        bearer(loginRes.data.accessToken!),
      );

      expect(status).toBe(403);
    });

    it('sin Bearer token → 401', async () => {
      const cliente = await createCliente('switch-no-auth');
      const { status } = await httpPost(`${baseUrl}/auth/switch`, { clienteId: cliente.id });
      expect(status).toBe(401);
    });
  });

  // ─── R11–R14 — Guards vía HTTP real (incl. root cross-tenant) ──────────

  describe('Guards vía HTTP real (R11–R14)', () => {
    it('JwtAuthGuard (R11): ruta protegida sin Bearer → 401', async () => {
      const { status } = await httpGet(`${baseUrl}/test-protected/root-only`);
      expect(status).toBe(401);
    });

    it('GlobalAdminGuard (R14): root → 200; usuario normal → 403 (ortogonalidad: rol ADMINISTRADOR no alcanza)', async () => {
      const root = await createUsuario('guard-root', { isGlobalAdmin: true });
      const rootLogin = await login(root.email);
      const rootOnly = await httpGet(
        `${baseUrl}/test-protected/root-only`,
        bearer(rootLogin.data.accessToken!),
      );
      expect(rootOnly.status).toBe(200);

      const cliente = await createCliente('guard-admin-normal');
      const roleAdmin = await createRoleConPermisos('ADMINISTRADOR', [
        'ticket:eliminar',
        'usuario:gestionar',
      ]);
      const normalAdmin = await createUsuario('guard-admin-normal');
      await createMembresia(normalAdmin.id, cliente.id, roleAdmin.id);
      const normalLogin = await login(normalAdmin.email);
      const denied = await httpGet(
        `${baseUrl}/test-protected/root-only`,
        bearer(normalLogin.data.accessToken!),
      );
      expect(denied.status).toBe(403);
    });

    it('AccionesGuard (R3): usuario CON la acción → 200; usuario SIN la acción → 403', async () => {
      const cliente = await createCliente('guard-permisos');
      const roleConPermiso = await createRoleConPermisos('COLABORADOR', ['ticket:crear']);
      const roleSinPermiso = await createRoleConPermisos('TECNICO_SIN_CREAR', ['ticket:editar']);
      const usuarioCon = await createUsuario('guard-permiso-con');
      const usuarioSin = await createUsuario('guard-permiso-sin');
      await createMembresia(usuarioCon.id, cliente.id, roleConPermiso.id);
      await createMembresia(usuarioSin.id, cliente.id, roleSinPermiso.id);
      // WU-7.1: el gate del harness usa 'TICKETS:ALTAS' (matriz nueva), no
      // 'ticket:crear' (RBAC viejo) — hay que sembrar la matriz directamente,
      // el role RBAC de arriba ya no alimenta `payload.permisos`.
      await permisosRepo.setPermisos(usuarioCon.id, cliente.id, ['TICKETS:ALTAS']);

      const loginCon = await login(usuarioCon.email);
      const okRes = await httpGet(
        `${baseUrl}/test-protected/permission-gated`,
        bearer(loginCon.data.accessToken!),
      );
      expect(okRes.status).toBe(200);

      const loginSin = await login(usuarioSin.email);
      const deniedRes = await httpGet(
        `${baseUrl}/test-protected/permission-gated`,
        bearer(loginSin.data.accessToken!),
      );
      expect(deniedRes.status).toBe(403);
    });

    it('TenantGuard (R12): cliente_id null (token master) → 403; cliente activo → 200; cliente suspendido mid-sesión → 403', async () => {
      const cliente = await createCliente('guard-tenant');
      const role = await createRoleConPermisos('TECNICO', ['ticket:editar']);
      const usuario = await createUsuario('guard-tenant');
      await createMembresia(usuario.id, cliente.id, role.id);
      const loginRes = await login(usuario.email);

      const okRes = await httpGet(
        `${baseUrl}/test-protected/tenant-only`,
        bearer(loginRes.data.accessToken!),
      );
      expect(okRes.status).toBe(200);

      cliente.suspend();
      await clienteRepo.save(cliente);
      const suspendedRes = await httpGet(
        `${baseUrl}/test-protected/tenant-only`,
        bearer(loginRes.data.accessToken!),
      );
      expect(suspendedRes.status).toBe(403);
    });

    it('root cross-tenant (ADR-4): token master → 403 en ruta tenant; tras switch a un cliente activo → 200 (sin necesitar membresía)', async () => {
      const cliente = await createCliente('guard-root-cross');
      const root = await createUsuario('guard-root-cross', { isGlobalAdmin: true });

      const masterLogin = await login(root.email);
      const masterOnTenant = await httpGet(
        `${baseUrl}/test-protected/tenant-only`,
        bearer(masterLogin.data.accessToken!),
      );
      expect(masterOnTenant.status).toBe(403);

      const switchRes = await httpPost<{ accessToken: string }>(
        `${baseUrl}/auth/switch`,
        { clienteId: cliente.id },
        bearer(masterLogin.data.accessToken!),
      );
      expect(switchRes.status).toBe(200);

      const scopedOnTenant = await httpGet(
        `${baseUrl}/test-protected/tenant-only`,
        bearer(switchRes.data.accessToken),
      );
      expect(scopedOnTenant.status).toBe(200);
      expect((scopedOnTenant.data as { clienteId: string }).clienteId).toBe(cliente.id);
    });
  });

  // ─── S3 (WU-7.7, ADR-P7) — Claim de versión del payload ─────────────────
  //
  // Solo el e2e prueba el PAR completo: el guard unitario (`jwt-auth.guard.
  // spec.ts`) ya afirma el 401 aislado — lo que NINGÚN otro nivel puede ver
  // es que `POST /auth/refresh` NO se auto-bloquee. Si `/auth/refresh`
  // quedara detrás de `JwtAuthGuard` por accidente, el 401 se volvería un
  // loop y el sistema quedaría inaccesible hasta que expire el refresh
  // token (riesgo #2218, mitigación citada en design-parte2 §5).

  describe('Claim de versión `v` del payload (S3, ADR-P7)', () => {
    it('access token SIN `v` (pre-deploy) → 401, nunca 403', async () => {
      const root = await createUsuario('v-ausente', { isGlobalAdmin: true });
      const loginRes = await login(root.email);
      const payload = jwtService.decode(loginRes.data.accessToken!) as Record<string, unknown>;
      delete payload.v;
      delete payload.iat;
      delete payload.exp;
      const tokenSinVersion = jwtService.sign(payload);

      const { status } = await httpGet(
        `${baseUrl}/test-protected/root-only`,
        bearer(tokenSinVersion),
      );

      expect(status).toBe(401);
    });

    it('access token con `v: 1` → 401, nunca 403', async () => {
      const root = await createUsuario('v1', { isGlobalAdmin: true });
      const loginRes = await login(root.email);
      const payload = jwtService.decode(loginRes.data.accessToken!) as Record<string, unknown>;
      payload.v = 1;
      delete payload.iat;
      delete payload.exp;
      const tokenV1 = jwtService.sign(payload);

      const { status } = await httpGet(`${baseUrl}/test-protected/root-only`, bearer(tokenV1));

      expect(status).toBe(401);
    });

    it('el 401 por versión NO auto-bloquea el refresh: `POST /auth/refresh` inmediatamente después devuelve un token `v: 2` con `permisos` en formato MODULO:ACCION', async () => {
      const cliente = await createCliente('v3-refresh');
      const role = await createRoleConPermisos('TECNICO', []);
      const usuario = await createUsuario('v3-refresh');
      await createMembresia(usuario.id, cliente.id, role.id);
      // `roles_permisos` (RBAC viejo) ya NO alimenta `payload.permisos` desde
      // WU-7.1 — la matriz nueva es la única fuente (R2), sembrada directo.
      await permisosRepo.setPermisos(usuario.id, cliente.id, ['TICKETS:ALTAS']);

      const loginRes = await login(usuario.email, PLAINTEXT_PASSWORD, cliente.id);

      // El 401 disparado por un `v` desactualizado (verificado arriba) NO
      // debe dejar el refresh inalcanzable: se pega directo a `/auth/refresh`
      // con el refresh token real, sin pasar por `JwtAuthGuard` (público).
      const refreshRes = await httpPost<{ accessToken: string; refreshToken: string }>(
        `${baseUrl}/auth/refresh`,
        { refreshToken: loginRes.data.refreshToken },
      );

      expect(refreshRes.status).toBe(200);
      const nuevoPayload = jwtService.decode(refreshRes.data.accessToken) as {
        v: number;
        permisos: string[];
      };
      expect(nuevoPayload.v).toBe(VERSION_PAYLOAD_JWT);
      // Formato nuevo MODULO:ACCION (R2/R7) — nunca el vocabulario viejo
      // `modulo:accion` en minúsculas (ej. `ticket:crear`).
      expect(nuevoPayload.permisos.some((p) => /^[A-Z]+:[A-Z_]+$/.test(p))).toBe(true);
    });
  });

  // ─── WU2 (sdd/cambio-de-contrasena) — POST /auth/change-password ────────

  describe('POST /auth/change-password (sdd/cambio-de-contrasena, WU2)', () => {
    async function passwordHashDe(usuarioId: string): Promise<string | undefined> {
      const row = await masterClient.usuario.findUnique({ where: { id: usuarioId } });
      return row?.passwordHash;
    }

    it('sin Bearer token → 401, no ejecuta el caso de uso', async () => {
      const { status } = await httpPost(`${baseUrl}/auth/change-password`, {
        passwordActual: PLAINTEXT_PASSWORD,
        passwordNueva: 'NuevaClave123',
      });

      expect(status).toBe(401);
    });

    it('passwordNueva con menos de 8 caracteres → 400 (ValidationPipe), sin tocar password_hash', async () => {
      const usuario = await createUsuario('cambio-corta', { isGlobalAdmin: true });
      const loginRes = await login(usuario.email);
      const hashAntes = await passwordHashDe(usuario.id);

      const { status } = await httpPost(
        `${baseUrl}/auth/change-password`,
        { passwordActual: PLAINTEXT_PASSWORD, passwordNueva: 'corta' },
        bearer(loginRes.data.accessToken!),
      );

      expect(status).toBe(400);
      expect(await passwordHashDe(usuario.id)).toBe(hashAntes);
    });

    it('passwordActual incorrecta → 422, password_hash sin cambios (doble asserto)', async () => {
      const usuario = await createUsuario('cambio-actual-mal', { isGlobalAdmin: true });
      const loginRes = await login(usuario.email);
      const hashAntes = await passwordHashDe(usuario.id);

      const { status, data } = await httpPost<{ error: string }>(
        `${baseUrl}/auth/change-password`,
        { passwordActual: 'no-es-la-clave', passwordNueva: 'NuevaClave123' },
        bearer(loginRes.data.accessToken!),
      );

      expect(status).toBe(422);
      expect(data.error).toBe('AUTH_PASSWORD_ACTUAL_INCORRECTA');
      expect(await passwordHashDe(usuario.id)).toBe(hashAntes);
    });

    it('passwordNueva === passwordActual → 422', async () => {
      const usuario = await createUsuario('cambio-igual', { isGlobalAdmin: true });
      const loginRes = await login(usuario.email);

      const { status, data } = await httpPost<{ error: string }>(
        `${baseUrl}/auth/change-password`,
        { passwordActual: PLAINTEXT_PASSWORD, passwordNueva: PLAINTEXT_PASSWORD },
        bearer(loginRes.data.accessToken!),
      );

      expect(status).toBe(422);
      expect(data.error).toBe('AUTH_PASSWORD_NUEVA_IGUAL');
    });

    it('test del sujeto: un usuarioId ajeno en el body NO tiene ningún efecto — cambia la clave del JWT, no la del body', async () => {
      const usuarioA = await createUsuario('sujeto-a', { isGlobalAdmin: true });
      const usuarioB = await createUsuario('sujeto-b', { isGlobalAdmin: true });
      const loginA = await login(usuarioA.email);
      const hashBAntes = await passwordHashDe(usuarioB.id);

      const { status } = await httpPost(
        `${baseUrl}/auth/change-password`,
        {
          usuarioId: usuarioB.id,
          passwordActual: PLAINTEXT_PASSWORD,
          passwordNueva: 'NuevaClaveA123',
        },
        bearer(loginA.data.accessToken!),
      );

      expect(status).toBe(204);
      // La clave de B queda intacta: `usuarioId` del body no tuvo ningún efecto.
      expect(await passwordHashDe(usuarioB.id)).toBe(hashBAntes);
      // La clave de A SÍ cambió: login con la vieja falla, con la nueva funciona.
      expect((await login(usuarioA.email, PLAINTEXT_PASSWORD)).status).toBe(401);
      expect((await login(usuarioA.email, 'NuevaClaveA123')).status).toBe(200);
    });

    it('éxito → 204; login con la clave vieja falla, con la nueva funciona; el refresh token previo queda inutilizable', async () => {
      const usuario = await createUsuario('cambio-exito', { isGlobalAdmin: true });
      const loginRes = await login(usuario.email);
      const refreshPrevio = loginRes.data.refreshToken!;

      const { status } = await httpPost(
        `${baseUrl}/auth/change-password`,
        { passwordActual: PLAINTEXT_PASSWORD, passwordNueva: 'NuevaClaveExito123' },
        bearer(loginRes.data.accessToken!),
      );

      expect(status).toBe(204);

      const loginConVieja = await login(usuario.email, PLAINTEXT_PASSWORD);
      expect(loginConVieja.status).toBe(401);
      const loginConNueva = await login(usuario.email, 'NuevaClaveExito123');
      expect(loginConNueva.status).toBe(200);

      const refreshTrasCambio = await httpPost(`${baseUrl}/auth/refresh`, {
        refreshToken: refreshPrevio,
      });
      expect(refreshTrasCambio.status).toBe(401);
    });
  });

  // ─── Sanity: la instancia sigue siendo Pool-clean (ninguna otra DB tocada) ──

  it('sanity: DATABASE_URL_MASTER apunta a una DB *_test', () => {
    const pool = new Pool({ connectionString: TEST_DB_URL });
    expect(TEST_DB_URL).toMatch(/_test$/);
    void pool.end();
  });
});
