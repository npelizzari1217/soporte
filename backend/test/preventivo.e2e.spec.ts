/**
 * preventivo.e2e.spec.ts — WU-4 (tarea 4.6), CRÍTICO. Levanta la app REAL
 * (Nest, `AccionesGuard` activo, sin mocks de infraestructura) y pega por
 * HTTP a `/preventivo/planes`.
 *
 * Mismo patrón que `reparaciones.e2e.spec.ts`/`compras.e2e.spec.ts`
 * (provisioning de tenant efímero, fetch nativo, `crearActorConPermisos`,
 * orden `app.close()` → limpieza de filas → `onModuleDestroy()` →
 * `dropDatabase`, turno exclusivo `usarLockMasterTest()` sobre la master de
 * test compartida).
 *
 * Cubre: los 4 gates de permiso REALES del módulo (403 sin el par, 2xx con él —
 * incluyendo el NEGATIVO explícito, no solo la positiva, porque un gate
 * probado solo por la positiva es indistinguible de un `true` hardcodeado),
 * el 422 del XOR de objetivo desde el dominio, y el 403 en la vista de
 * generaciones sin `PREVENTIVO:LECTURA`. También el responsable del plan: la lista del selector
 * (`GET /preventivo/planes/responsables`) trae solo a TECNICO y COLABORADOR con `LECTURA` sobre el
 * tipo PREVENTIVO, y el alta y la edición rechazan con 422 a cualquier otro.
 *
 * odd/preventivo-por-tipo (S1-S5): el plan tiene un tipo de ticket. La celda del módulo sigue
 * decidiendo la acción y el tipo agrega visibilidad: el actor ve, edita y da de baja solo los planes
 * de tipos con `LECTURA` (404 si no), y solo elige tipos con `LECTURA` (403 si no). Los actores se
 * crean con `LECTURA` sobre PREVENTIVO salvo que el caso diga otra cosa; el responsable sale de los
 * técnicos del tipo del plan.
 *
 * Ref spec: sdd/preventivo/spec, Requirements "Objetivo excluyente del
 * plan", "Permiso propio del módulo PREVENTIVO", "Baja de plan frena
 * generación sin borrar historial". Ref design: ADR-PV1, ADR-PV6. Tarea: 4.6.
 */
import { randomBytes } from 'node:crypto';
import {
  INestApplication,
  MiddlewareConsumer,
  Module,
  NestModule,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { SharedModule } from '../src/shared/shared.module';
import { AuthModule } from '../src/auth/auth.module';
import { PreventivoModule } from '../src/preventivo/preventivo.module';
import { TenantScopeMiddleware } from '../src/shared/tenancy/tenant-scope.middleware';

import { PrismaService } from '../src/shared/infrastructure/persistence/prisma.service';
import {
  MasterPrismaClient,
  TenantPrismaClient,
} from '../src/shared/infrastructure/persistence/prisma-clients';
import { PostgresAdminService } from '../src/clientes/infrastructure/postgres-admin.service';
import { TenantMigrationRunnerAdapter } from '../src/clientes/infrastructure/tenant-migration-runner.adapter';
import { TenantSeederAdapter } from '../src/clientes/infrastructure/tenant-seeder.adapter';
import { PrismaClienteRepository } from '../src/clientes/infrastructure/persistence/prisma/prisma-cliente.repository';
import { PrismaUsuarioRepository } from '../src/auth/infrastructure/persistence/prisma/prisma-usuario.repository';
import { PrismaMatrizPermisosRepository } from '../src/auth/infrastructure/persistence/prisma/prisma-matriz-permisos.repository';
import { ClienteEntity } from '../src/clientes/domain/entities/cliente.entity';
import { UsuarioEntity } from '../src/auth/domain/entities/usuario.entity';
import { RoleEntity } from '../src/auth/domain/entities/role.entity';
import { Argon2HashProvider } from '../src/auth/infrastructure/argon2-hash.provider';
import { PlanPreventivoResponseDto } from '../src/preventivo/interface/dtos/preventivo.dto';
import { usarLockMasterTest } from '../src/testing/lock-master-test';
import { TIPO_CODIGO_PREVENTIVO } from '../src/tickets/domain/tipos-ticket.constants';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const TENANT_DB_NAME = `soporte_prov_prevE2E_${randomBytes(4).toString('hex')}_test`;
const PLAINTEXT_PASSWORD = 'E2ePreventivoSecret!123';

// ─── Helpers HTTP (fetch nativo, mismo patrón que reparaciones.e2e.spec.ts) ─

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

async function httpPatch<T = unknown>(
  url: string,
  body: unknown,
  headers: Headers = {},
): Promise<{ status: number; data: T }> {
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as T;
  return { status: res.status, data };
}

async function httpDelete(url: string, headers: Headers = {}): Promise<{ status: number }> {
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { Accept: 'application/json', ...headers },
  });
  return { status: res.status };
}

function bearer(token: string): Headers {
  return { Authorization: `Bearer ${token}` };
}

@Module({ imports: [SharedModule, AuthModule, PreventivoModule] })
class TestHarnessModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantScopeMiddleware).forRoutes('*');
  }
}

// Turno exclusivo sobre la master de test compartida — ver src/testing/lock-master-test.ts.
usarLockMasterTest();

describe('Preventivo e2e — ABM de planes, autorización REAL por HTTP (WU-4, crítico)', () => {
  let app: INestApplication;
  let baseUrl: string;

  let prismaService: PrismaService;
  let masterClient: InstanceType<typeof MasterPrismaClient>;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;
  let clienteRepo: PrismaClienteRepository;
  let usuarioRepo: PrismaUsuarioRepository;
  let permisosRepo: PrismaMatrizPermisosRepository;
  let hashProvider: Argon2HashProvider;

  const admin = new PostgresAdminService(MASTER_TEST_URL);

  let prioridadId: string;
  let tipoPreventivoId: string;
  let otroTipoId: string;
  /** Técnico con `LECTURA` sobre PREVENTIVO del último cliente creado: el responsable válido. */
  let responsableElegibleId: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL_MASTER) {
      process.env.DATABASE_URL_MASTER = MASTER_TEST_URL;
    }

    await admin.createDatabase(TENANT_DB_NAME);
    await new TenantMigrationRunnerAdapter(MASTER_TEST_URL).run(TENANT_DB_NAME);
    await new TenantSeederAdapter(MASTER_TEST_URL).seed(TENANT_DB_NAME);

    prismaService = new PrismaService(MASTER_TEST_URL);
    masterClient = prismaService.getMasterClient();
    tenantClient = prismaService.getTenantClient(TENANT_DB_NAME);
    clienteRepo = new PrismaClienteRepository(prismaService);
    usuarioRepo = new PrismaUsuarioRepository(prismaService);
    permisosRepo = new PrismaMatrizPermisosRepository(prismaService);
    hashProvider = new Argon2HashProvider();

    const prioridadMedia = await tenantClient.prioridad.findUniqueOrThrow({
      where: { codigo: 'MEDIA' },
    });
    prioridadId = prioridadMedia.id;
    tipoPreventivoId = (
      await tenantClient.tipoTicket.findUniqueOrThrow({ where: { codigo: TIPO_CODIGO_PREVENTIVO } })
    ).id;
    otroTipoId = (
      await tenantClient.tipoTicket.findFirstOrThrow({
        where: { codigo: { not: TIPO_CODIGO_PREVENTIVO } },
      })
    ).id;

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [TestHarnessModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    await app.listen(0);

    const port = (app.getHttpServer() as { address: () => { port: number } }).address().port;
    baseUrl = `http://localhost:${port}`;
  }, 90_000);

  afterAll(async () => {
    // Orden CRÍTICO: app.close() SIEMPRE antes de dropDatabase.
    try {
      await app?.close();
    } catch {
      /* no-op */
    }
    try {
      await prismaService?.onModuleDestroy();
    } catch {
      /* no-op */
    }
    await admin.dropDatabase(TENANT_DB_NAME);
  }, 60_000);

  beforeEach(async () => {
    await masterClient.$executeRawUnsafe(
      'TRUNCATE TABLE membresias, refresh_tokens, usuario_cliente_permisos, usuarios, clientes, roles RESTART IDENTITY CASCADE',
    );
  });

  // ─── Fixtures (master) ──────────────────────────────────────────────────

  async function crearClienteTenant(): Promise<ClienteEntity> {
    const cliente = ClienteEntity.create({
      nombre: `E2E Preventivo ${randomBytes(3).toString('hex')}`,
      razonSocial: null,
      cuit: null,
      dbName: TENANT_DB_NAME,
      activo: true,
    });
    await clienteRepo.save(cliente);
    return cliente;
  }

  async function createRole(codigo: string): Promise<RoleEntity> {
    const role = RoleEntity.create({ codigo, nombre: codigo, descripcion: null, permisos: [] });
    await masterClient.role.create({
      data: { id: role.id, codigo: role.codigo, nombre: role.nombre },
    });
    return role;
  }

  async function createUsuario(suffix: string): Promise<UsuarioEntity> {
    const usuario = UsuarioEntity.create({
      email: `e2e_prev_${suffix}@test.local`,
      nombre: 'E2E',
      apellido: 'Preventivo',
      passwordHash: await hashProvider.hash(PLAINTEXT_PASSWORD),
      activo: true,
      isGlobalAdmin: false,
    });
    await usuarioRepo.save(usuario);
    return usuario;
  }

  async function createMembresia(
    usuarioId: string,
    clienteId: string,
    rolId: string,
  ): Promise<void> {
    await masterClient.membresia.create({ data: { usuarioId, clienteId, rolId, activo: true } });
  }

  /** Rol del sistema por código: lo crea la primera vez (la tabla se trunca en cada test). */
  async function rolDeSistema(codigo: string): Promise<string> {
    const existente = await masterClient.role.findUnique({ where: { codigo } });
    return existente?.id ?? (await createRole(codigo)).id;
  }

  /**
   * Usuario con membresía en el cliente, con el rol dado y `LECTURA` sobre los tipos dados en
   * `permisos_tipo_ticket` del tenant.
   */
  async function crearUsuarioDelTenant(
    clienteId: string,
    rolCodigo: string,
    tiposConLectura: string[],
  ): Promise<string> {
    const usuario = await createUsuario(randomBytes(3).toString('hex'));
    await createMembresia(usuario.id, clienteId, await rolDeSistema(rolCodigo));
    if (tiposConLectura.length > 0) {
      await tenantClient.permisoTipoTicket.createMany({
        data: tiposConLectura.map((tipoId) => ({
          usuarioId: usuario.id,
          tipoId,
          accion: 'LECTURA',
        })),
      });
    }
    return usuario.id;
  }

  async function login(email: string): Promise<{ accessToken: string }> {
    const { data } = await httpPost<{ accessToken: string }>(`${baseUrl}/auth/login`, {
      email,
      password: PLAINTEXT_PASSWORD,
    });
    return data;
  }

  /**
   * Actor con exactamente las celdas pedidas (rol NO 'ADMINISTRADOR' a
   * propósito: ese código bypassea el `AccionesGuard` completo y las
   * aserciones de "sin el permiso → 403" quedarían mudas).
   */
  async function crearActorConPermisos(
    permisos: string[],
    clienteIdExistente?: string,
    tiposConLectura: string[] = [tipoPreventivoId],
  ): Promise<{ accessToken: string; clienteId: string }> {
    const clienteId = clienteIdExistente ?? (await crearClienteTenant()).id;
    if (clienteIdExistente === undefined) {
      responsableElegibleId = await crearUsuarioDelTenant(clienteId, 'TECNICO', [tipoPreventivoId]);
    }
    const role = await createRole(`ROL_E2E_PREV_${randomBytes(3).toString('hex')}`);
    const usuario = await createUsuario(randomBytes(3).toString('hex'));
    await createMembresia(usuario.id, clienteId, role.id);
    await permisosRepo.setPermisos(usuario.id, clienteId, permisos);
    // Visibilidad por tipo (odd/preventivo-por-tipo, S4): filas del tenant, no celdas del JWT.
    if (tiposConLectura.length > 0) {
      await tenantClient.permisoTipoTicket.createMany({
        data: tiposConLectura.map((tipoId) => ({
          usuarioId: usuario.id,
          tipoId,
          accion: 'LECTURA',
        })),
      });
    }
    const { accessToken } = await login(usuario.email);
    return { accessToken, clienteId };
  }

  function planValidoBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      titulo: 'Cambio de filtros de AC',
      ubicacion: 'DEPOSITO CENTRAL',
      prioridadId,
      tipoId: tipoPreventivoId,
      responsableId: responsableElegibleId,
      intervaloValor: 3,
      intervaloUnidad: 'MESES',
      fechaInicio: '2026-01-01',
      ...overrides,
    };
  }

  // ─── POST /preventivo/planes — PREVENTIVO:ALTAS ─────────────────────────

  describe('POST /preventivo/planes — PREVENTIVO:ALTAS', () => {
    it('actor SIN PREVENTIVO:ALTAS → 403 (el candado vive en el backend, no en la UI)', async () => {
      const actor = await crearActorConPermisos(['PREVENTIVO:LECTURA']);

      const { status } = await httpPost(
        `${baseUrl}/preventivo/planes`,
        planValidoBody(),
        bearer(actor.accessToken),
      );

      expect(status).toBe(403);
    });

    it('actor CON PREVENTIVO:ALTAS → 201', async () => {
      const actor = await crearActorConPermisos(['PREVENTIVO:ALTAS']);

      const { status, data } = await httpPost<PlanPreventivoResponseDto>(
        `${baseUrl}/preventivo/planes`,
        planValidoBody(),
        bearer(actor.accessToken),
      );

      expect(status).toBe(201);
      expect(data.titulo).toBe('Cambio de filtros de AC');
      expect(data.activo).toBe(true);
    });

    it('[CRITICAL] 422 del XOR de objetivo desde el dominio: equipoId Y ubicación a la vez', async () => {
      const actor = await crearActorConPermisos(['PREVENTIVO:ALTAS']);

      const { status } = await httpPost(
        `${baseUrl}/preventivo/planes`,
        planValidoBody({
          ubicacion: 'DEPOSITO CENTRAL',
          equipoId: '01900000-0000-7000-8000-000000000301',
        }),
        bearer(actor.accessToken),
      );

      expect(status).toBe(422);
    });

    it('422 del XOR de objetivo: ni equipoId ni ubicación', async () => {
      const actor = await crearActorConPermisos(['PREVENTIVO:ALTAS']);

      const { status } = await httpPost(
        `${baseUrl}/preventivo/planes`,
        planValidoBody({ ubicacion: undefined }),
        bearer(actor.accessToken),
      );

      expect(status).toBe(422);
    });

    // Hallazgo de revisión: "los límites de la base son más estrictos que el
    // dominio" — sin los guards de WU-8, estos tres casos llegaban al INSERT y
    // devolvían un 500 crudo (`PrismaClientKnownRequestError` sin mapear). Los
    // tres los ataja el `@MaxLength`/`@Max` del DTO (`ValidationPipe` global) —
    // igual que cualquier otro rechazo de `class-validator` en este repo
    // (`reparaciones.dto.ts`: "@MinLength(1) con un 400"), el status es 400,
    // NO 422 (422 es exclusivo de `Result.fail()` de dominio). El backstop de
    // dominio (`plan-preventivo.entity.spec.ts`) sigue siendo la autoridad
    // real — este test prueba el contrato HTTP end-to-end, nunca 500.
    it('[CRITICAL] título de 256 caracteres → 400, NUNCA 500 (backstop VarChar(255))', async () => {
      const actor = await crearActorConPermisos(['PREVENTIVO:ALTAS']);

      const { status } = await httpPost(
        `${baseUrl}/preventivo/planes`,
        planValidoBody({ titulo: 'A'.repeat(256) }),
        bearer(actor.accessToken),
      );

      expect(status).toBe(400);
    });

    it('ubicación de 256 caracteres → 400, NUNCA 500 (backstop VarChar(255))', async () => {
      const actor = await crearActorConPermisos(['PREVENTIVO:ALTAS']);

      const { status } = await httpPost(
        `${baseUrl}/preventivo/planes`,
        planValidoBody({ ubicacion: 'B'.repeat(256), equipoId: undefined }),
        bearer(actor.accessToken),
      );

      expect(status).toBe(400);
    });

    it('[CRITICAL] intervaloValor desbordaría int4 (3_000_000_000) → 400, NUNCA 500', async () => {
      const actor = await crearActorConPermisos(['PREVENTIVO:ALTAS']);

      const { status } = await httpPost(
        `${baseUrl}/preventivo/planes`,
        planValidoBody({ intervaloValor: 3_000_000_000 }),
        bearer(actor.accessToken),
      );

      expect(status).toBe(400);
    });
  });

  // ─── GET /preventivo/planes — PREVENTIVO:LECTURA ────────────────────────

  describe('GET /preventivo/planes — PREVENTIVO:LECTURA', () => {
    it('actor SIN PREVENTIVO:LECTURA → 403', async () => {
      const actor = await crearActorConPermisos(['PREVENTIVO:ALTAS']);

      const { status } = await httpGet(`${baseUrl}/preventivo/planes`, bearer(actor.accessToken));

      expect(status).toBe(403);
    });

    it('actor CON PREVENTIVO:LECTURA → 200 y lista el plan creado', async () => {
      const actor = await crearActorConPermisos(['PREVENTIVO:ALTAS', 'PREVENTIVO:LECTURA']);
      const creado = await httpPost<PlanPreventivoResponseDto>(
        `${baseUrl}/preventivo/planes`,
        planValidoBody(),
        bearer(actor.accessToken),
      );

      const { status, data } = await httpGet<PlanPreventivoResponseDto[]>(
        `${baseUrl}/preventivo/planes`,
        bearer(actor.accessToken),
      );

      expect(status).toBe(200);
      expect(data.map((p) => p.id)).toContain(creado.data.id);
    });
  });

  // ─── GET /preventivo/planes/:id/generaciones — PREVENTIVO:LECTURA ───────

  describe('GET /preventivo/planes/:id/generaciones — PREVENTIVO:LECTURA', () => {
    it('[CRITICAL] actor SIN PREVENTIVO:LECTURA → 403', async () => {
      const creador = await crearActorConPermisos(['PREVENTIVO:ALTAS', 'PREVENTIVO:LECTURA']);
      const creado = await httpPost<PlanPreventivoResponseDto>(
        `${baseUrl}/preventivo/planes`,
        planValidoBody(),
        bearer(creador.accessToken),
      );

      const actorSinLectura = await crearActorConPermisos([], creador.clienteId);
      const { status } = await httpGet(
        `${baseUrl}/preventivo/planes/${creado.data.id}/generaciones`,
        bearer(actorSinLectura.accessToken),
      );

      expect(status).toBe(403);
    });

    it('actor CON PREVENTIVO:LECTURA → 200 (lista vacía, sin generaciones todavía)', async () => {
      const actor = await crearActorConPermisos(['PREVENTIVO:ALTAS', 'PREVENTIVO:LECTURA']);
      const creado = await httpPost<PlanPreventivoResponseDto>(
        `${baseUrl}/preventivo/planes`,
        planValidoBody(),
        bearer(actor.accessToken),
      );

      const { status, data } = await httpGet(
        `${baseUrl}/preventivo/planes/${creado.data.id}/generaciones`,
        bearer(actor.accessToken),
      );

      expect(status).toBe(200);
      expect(data).toEqual([]);
    });

    it('plan inexistente, con PREVENTIVO:LECTURA → 404', async () => {
      const actor = await crearActorConPermisos(['PREVENTIVO:LECTURA']);

      const { status } = await httpGet(
        `${baseUrl}/preventivo/planes/00000000-0000-4000-8000-000000000fff/generaciones`,
        bearer(actor.accessToken),
      );

      expect(status).toBe(404);
    });
  });

  // ─── PATCH /preventivo/planes/:id — PREVENTIVO:MODIFICACION ─────────────

  describe('PATCH /preventivo/planes/:id — PREVENTIVO:MODIFICACION', () => {
    it('actor SIN PREVENTIVO:MODIFICACION → 403', async () => {
      const creador = await crearActorConPermisos(['PREVENTIVO:ALTAS']);
      const creado = await httpPost<PlanPreventivoResponseDto>(
        `${baseUrl}/preventivo/planes`,
        planValidoBody(),
        bearer(creador.accessToken),
      );

      const actorSinModificacion = await crearActorConPermisos([], creador.clienteId);
      const { status } = await httpPatch(
        `${baseUrl}/preventivo/planes/${creado.data.id}`,
        { titulo: 'Nuevo título' },
        bearer(actorSinModificacion.accessToken),
      );

      expect(status).toBe(403);
    });

    it('actor CON PREVENTIVO:MODIFICACION → 200 y refleja el cambio', async () => {
      const actor = await crearActorConPermisos(['PREVENTIVO:ALTAS', 'PREVENTIVO:MODIFICACION']);
      const creado = await httpPost<PlanPreventivoResponseDto>(
        `${baseUrl}/preventivo/planes`,
        planValidoBody(),
        bearer(actor.accessToken),
      );

      const { status, data } = await httpPatch<PlanPreventivoResponseDto>(
        `${baseUrl}/preventivo/planes/${creado.data.id}`,
        { titulo: 'Nuevo título' },
        bearer(actor.accessToken),
      );

      expect(status).toBe(200);
      expect(data.titulo).toBe('Nuevo título');
    });

    // Hallazgo C1 del verify: `activo` viaja en el mismo PATCH (EP-R1), sin
    // endpoint aparte para activar/desactivar. Esta capa solo tenía cobertura
    // de `titulo`; sin este caso, un `activo: dto.activo` que se rompiera en
    // el controller (por ejemplo mandando `undefined`) no lo atrapaba nada.
    it('actor CON PREVENTIVO:MODIFICACION → 200, activo:false se persiste', async () => {
      const actor = await crearActorConPermisos(['PREVENTIVO:ALTAS', 'PREVENTIVO:MODIFICACION']);
      const creado = await httpPost<PlanPreventivoResponseDto>(
        `${baseUrl}/preventivo/planes`,
        planValidoBody(),
        bearer(actor.accessToken),
      );
      expect(creado.data.activo).toBe(true);

      const { status, data } = await httpPatch<PlanPreventivoResponseDto>(
        `${baseUrl}/preventivo/planes/${creado.data.id}`,
        { activo: false },
        bearer(actor.accessToken),
      );

      expect(status).toBe(200);
      expect(data.activo).toBe(false);

      const filaCruda = await tenantClient.planPreventivo.findUnique({
        where: { id: creado.data.id },
      });
      expect(filaCruda!.activo).toBe(false);
    });
  });

  // ─── DELETE /preventivo/planes/:id — PREVENTIVO:BORRADO, [R4] ───────────

  describe('DELETE /preventivo/planes/:id — PREVENTIVO:BORRADO [R4]', () => {
    it('actor SIN PREVENTIVO:BORRADO → 403', async () => {
      const creador = await crearActorConPermisos(['PREVENTIVO:ALTAS']);
      const creado = await httpPost<PlanPreventivoResponseDto>(
        `${baseUrl}/preventivo/planes`,
        planValidoBody(),
        bearer(creador.accessToken),
      );

      const actorSinBorrado = await crearActorConPermisos([], creador.clienteId);
      const { status } = await httpDelete(
        `${baseUrl}/preventivo/planes/${creado.data.id}`,
        bearer(actorSinBorrado.accessToken),
      );

      expect(status).toBe(403);
    });

    it('[R4] actor CON PREVENTIVO:BORRADO → 204, y el plan desaparece del listado pero sigue existiendo (soft delete, no DELETE físico)', async () => {
      const actor = await crearActorConPermisos([
        'PREVENTIVO:ALTAS',
        'PREVENTIVO:LECTURA',
        'PREVENTIVO:BORRADO',
      ]);
      const creado = await httpPost<PlanPreventivoResponseDto>(
        `${baseUrl}/preventivo/planes`,
        planValidoBody(),
        bearer(actor.accessToken),
      );

      const baja = await httpDelete(
        `${baseUrl}/preventivo/planes/${creado.data.id}`,
        bearer(actor.accessToken),
      );
      expect(baja.status).toBe(204);

      const listado = await httpGet<PlanPreventivoResponseDto[]>(
        `${baseUrl}/preventivo/planes`,
        bearer(actor.accessToken),
      );
      expect(listado.data.map((p) => p.id)).not.toContain(creado.data.id);

      // La fila NO se borró físicamente — sigue en la tabla, soft-deleted.
      const filaCruda = await tenantClient.planPreventivo.findUnique({
        where: { id: creado.data.id },
      });
      expect(filaCruda).not.toBeNull();
      expect(filaCruda!.deletedAt).not.toBeNull();
      expect(filaCruda!.activo).toBe(false);
    });
  });

  // ─── Responsable del plan: técnicos del tipo PREVENTIVO ─────────────────

  describe('Responsable del plan — TECNICO o COLABORADOR con LECTURA sobre PREVENTIVO', () => {
    /** Los que NO tienen que poder ser responsables, en el cliente del actor. */
    async function crearNoElegibles(clienteId: string): Promise<Record<string, string>> {
      return {
        usuarioConLectura: await crearUsuarioDelTenant(clienteId, 'USUARIO', [tipoPreventivoId]),
        tecnicoDeOtroTipo: await crearUsuarioDelTenant(clienteId, 'TECNICO', [otroTipoId]),
        tecnicoSinPermisos: await crearUsuarioDelTenant(clienteId, 'TECNICO', []),
      };
    }

    it.each([['PREVENTIVO:ALTAS'], ['PREVENTIVO:MODIFICACION']])(
      'GET /preventivo/planes/responsables con %s → 200, solo los técnicos de PREVENTIVO',
      async (permiso) => {
        const actor = await crearActorConPermisos([permiso]);
        const colaborador = await crearUsuarioDelTenant(actor.clienteId, 'COLABORADOR', [
          tipoPreventivoId,
        ]);
        await crearNoElegibles(actor.clienteId);

        const { status, data } = await httpGet<{ id: string }[]>(
          `${baseUrl}/preventivo/planes/responsables?tipoId=${tipoPreventivoId}`,
          bearer(actor.accessToken),
        );

        expect(status).toBe(200);
        expect(data.map((r) => r.id).sort()).toEqual([responsableElegibleId, colaborador].sort());
      },
    );

    it('GET /preventivo/planes/responsables sin PREVENTIVO:ALTAS ni MODIFICACION → 403', async () => {
      const actor = await crearActorConPermisos(['PREVENTIVO:LECTURA']);

      const { status } = await httpGet(
        `${baseUrl}/preventivo/planes/responsables?tipoId=${tipoPreventivoId}`,
        bearer(actor.accessToken),
      );

      expect(status).toBe(403);
    });

    it.each([['usuarioConLectura'], ['tecnicoDeOtroTipo'], ['tecnicoSinPermisos']])(
      'POST con un responsable no elegible (%s) → 422, sin crear el plan',
      async (caso) => {
        const actor = await crearActorConPermisos(['PREVENTIVO:ALTAS']);
        const noElegibles = await crearNoElegibles(actor.clienteId);
        const antes = await tenantClient.planPreventivo.count();

        const { status } = await httpPost(
          `${baseUrl}/preventivo/planes`,
          planValidoBody({ responsableId: noElegibles[caso] }),
          bearer(actor.accessToken),
        );

        expect(status).toBe(422);
        expect(await tenantClient.planPreventivo.count()).toBe(antes);
      },
    );

    it('PATCH que cambia el responsable a uno no elegible → 422, el plan conserva el suyo', async () => {
      const actor = await crearActorConPermisos(['PREVENTIVO:ALTAS', 'PREVENTIVO:MODIFICACION']);
      const creado = await httpPost<PlanPreventivoResponseDto>(
        `${baseUrl}/preventivo/planes`,
        planValidoBody(),
        bearer(actor.accessToken),
      );
      const { tecnicoDeOtroTipo } = await crearNoElegibles(actor.clienteId);

      const { status } = await httpPatch(
        `${baseUrl}/preventivo/planes/${creado.data.id}`,
        { titulo: 'Nuevo título', responsableId: tecnicoDeOtroTipo },
        bearer(actor.accessToken),
      );

      expect(status).toBe(422);
      const fila = await tenantClient.planPreventivo.findUniqueOrThrow({
        where: { id: creado.data.id },
      });
      expect(fila.responsableId).toBe(responsableElegibleId);
      expect(fila.titulo).toBe('Cambio de filtros de AC');
    });

    it('PATCH que cambia el responsable a un COLABORADOR de PREVENTIVO → 200', async () => {
      const actor = await crearActorConPermisos(['PREVENTIVO:ALTAS', 'PREVENTIVO:MODIFICACION']);
      const creado = await httpPost<PlanPreventivoResponseDto>(
        `${baseUrl}/preventivo/planes`,
        planValidoBody(),
        bearer(actor.accessToken),
      );
      const colaborador = await crearUsuarioDelTenant(actor.clienteId, 'COLABORADOR', [
        tipoPreventivoId,
      ]);

      const { status, data } = await httpPatch<PlanPreventivoResponseDto>(
        `${baseUrl}/preventivo/planes/${creado.data.id}`,
        { responsableId: colaborador },
        bearer(actor.accessToken),
      );

      expect(status).toBe(200);
      expect(data.responsableId).toBe(colaborador);
    });
  });

  // ─── Tipo de ticket del plan (odd/preventivo-por-tipo, S1-S5) ───────────

  describe('Tipo de ticket del plan — la celda del módulo decide la acción, el tipo la visibilidad', () => {
    const CELDAS_COMPLETAS = [
      'PREVENTIVO:LECTURA',
      'PREVENTIVO:ALTAS',
      'PREVENTIVO:MODIFICACION',
      'PREVENTIVO:BORRADO',
    ];

    /** Crea un plan de PREVENTIVO y otro de `otroTipoId`, con un creador que ve los dos tipos. */
    async function planesDeDosTipos(): Promise<{
      clienteId: string;
      planPreventivo: string;
      planOtroTipo: string;
      tecnicoOtroTipo: string;
    }> {
      const creador = await crearActorConPermisos(CELDAS_COMPLETAS, undefined, [
        tipoPreventivoId,
        otroTipoId,
      ]);
      const tecnicoOtroTipo = await crearUsuarioDelTenant(creador.clienteId, 'TECNICO', [
        otroTipoId,
      ]);
      const preventivo = await httpPost<PlanPreventivoResponseDto>(
        `${baseUrl}/preventivo/planes`,
        planValidoBody(),
        bearer(creador.accessToken),
      );
      const otro = await httpPost<PlanPreventivoResponseDto>(
        `${baseUrl}/preventivo/planes`,
        planValidoBody({ tipoId: otroTipoId, responsableId: tecnicoOtroTipo }),
        bearer(creador.accessToken),
      );
      expect([preventivo.status, otro.status]).toEqual([201, 201]);
      expect(otro.data.tipoId).toBe(otroTipoId);
      return {
        clienteId: creador.clienteId,
        planPreventivo: preventivo.data.id,
        planOtroTipo: otro.data.id,
        tecnicoOtroTipo,
      };
    }

    it('S1: el listado trae solo los planes de los tipos con LECTURA', async () => {
      const { clienteId, planPreventivo, planOtroTipo } = await planesDeDosTipos();
      const soloOtroTipo = await crearActorConPermisos(['PREVENTIVO:LECTURA'], clienteId, [
        otroTipoId,
      ]);

      const { status, data } = await httpGet<PlanPreventivoResponseDto[]>(
        `${baseUrl}/preventivo/planes`,
        bearer(soloOtroTipo.accessToken),
      );

      expect(status).toBe(200);
      const ids = data.map((p) => p.id);
      expect(ids).toContain(planOtroTipo);
      expect(ids).not.toContain(planPreventivo);
    });

    it('S4: generaciones, edición y baja de un plan de un tipo sin LECTURA → 404, y el plan no cambia', async () => {
      const { clienteId, planPreventivo } = await planesDeDosTipos();
      const soloOtroTipo = await crearActorConPermisos(CELDAS_COMPLETAS, clienteId, [otroTipoId]);
      const auth = bearer(soloOtroTipo.accessToken);

      const generaciones = await httpGet(
        `${baseUrl}/preventivo/planes/${planPreventivo}/generaciones`,
        auth,
      );
      const edicion = await httpPatch(
        `${baseUrl}/preventivo/planes/${planPreventivo}`,
        { titulo: 'Título ajeno' },
        auth,
      );
      const baja = await httpDelete(`${baseUrl}/preventivo/planes/${planPreventivo}`, auth);

      expect([generaciones.status, edicion.status, baja.status]).toEqual([404, 404, 404]);
      const fila = await tenantClient.planPreventivo.findUniqueOrThrow({
        where: { id: planPreventivo },
      });
      expect(fila.titulo).toBe('Cambio de filtros de AC');
      expect(fila.deletedAt).toBeNull();
    });

    it('S4: el alta con un tipo sin LECTURA → 403, sin crear el plan', async () => {
      const actor = await crearActorConPermisos(['PREVENTIVO:ALTAS'], undefined, [
        tipoPreventivoId,
      ]);
      const antes = await tenantClient.planPreventivo.count();

      const { status } = await httpPost(
        `${baseUrl}/preventivo/planes`,
        planValidoBody({ tipoId: otroTipoId }),
        bearer(actor.accessToken),
      );

      expect(status).toBe(403);
      expect(await tenantClient.planPreventivo.count()).toBe(antes);
    });

    it('S2: el alta sin tipoId → 400, y con un tipo dado de baja → 422, como el alta de un ticket', async () => {
      const actor = await crearActorConPermisos(['PREVENTIVO:ALTAS']);
      const tipoBaja = await tenantClient.tipoTicket.create({
        data: {
          codigo: `E2E_BAJA_${randomBytes(3).toString('hex')}`,
          nombre: 'Tipo dado de baja',
          modulo: 'TICKETS',
          activo: false,
          deletedAt: new Date(),
        },
      });

      const sinTipo = await httpPost(
        `${baseUrl}/preventivo/planes`,
        planValidoBody({ tipoId: undefined }),
        bearer(actor.accessToken),
      );
      const conTipoDeBaja = await httpPost(
        `${baseUrl}/preventivo/planes`,
        planValidoBody({ tipoId: tipoBaja.id }),
        bearer(actor.accessToken),
      );

      expect(sinTipo.status).toBe(400);
      expect(conTipoDeBaja.status).toBe(422);
    });

    it('S2/S5: la edición cambia el tipo con un responsable de ese tipo; conservando uno que no lo es → 422', async () => {
      const { clienteId, planPreventivo, tecnicoOtroTipo } = await planesDeDosTipos();
      const editor = await crearActorConPermisos(['PREVENTIVO:MODIFICACION'], clienteId, [
        tipoPreventivoId,
        otroTipoId,
      ]);
      const auth = bearer(editor.accessToken);

      // El responsable vigente es técnico de PREVENTIVO, no del tipo nuevo: se revalida.
      const conservando = await httpPatch(
        `${baseUrl}/preventivo/planes/${planPreventivo}`,
        { tipoId: otroTipoId },
        auth,
      );
      expect(conservando.status).toBe(422);
      expect(
        (await tenantClient.planPreventivo.findUniqueOrThrow({ where: { id: planPreventivo } }))
          .tipoId,
      ).toBe(tipoPreventivoId);

      const cambiando = await httpPatch<PlanPreventivoResponseDto>(
        `${baseUrl}/preventivo/planes/${planPreventivo}`,
        { tipoId: otroTipoId, responsableId: tecnicoOtroTipo },
        auth,
      );
      expect(cambiando.status).toBe(200);
      expect(cambiando.data.tipoId).toBe(otroTipoId);
      const fila = await tenantClient.planPreventivo.findUniqueOrThrow({
        where: { id: planPreventivo },
      });
      expect([fila.tipoId, fila.responsableId]).toEqual([otroTipoId, tecnicoOtroTipo]);
    });

    it('S4: la edición a un tipo sin LECTURA → 403, el plan conserva el suyo', async () => {
      const { clienteId, planPreventivo, tecnicoOtroTipo } = await planesDeDosTipos();
      const editor = await crearActorConPermisos(['PREVENTIVO:MODIFICACION'], clienteId, [
        tipoPreventivoId,
      ]);

      const { status } = await httpPatch(
        `${baseUrl}/preventivo/planes/${planPreventivo}`,
        { tipoId: otroTipoId, responsableId: tecnicoOtroTipo },
        bearer(editor.accessToken),
      );

      expect(status).toBe(403);
      const fila = await tenantClient.planPreventivo.findUniqueOrThrow({
        where: { id: planPreventivo },
      });
      expect(fila.tipoId).toBe(tipoPreventivoId);
    });

    it('S5: responsables?tipoId= trae los técnicos de ese tipo; sin tipoId → 400; tipo sin LECTURA → 403', async () => {
      const { clienteId, tecnicoOtroTipo } = await planesDeDosTipos();
      const actor = await crearActorConPermisos(['PREVENTIVO:ALTAS'], clienteId, [otroTipoId]);
      const auth = bearer(actor.accessToken);

      const delOtroTipo = await httpGet<{ id: string }[]>(
        `${baseUrl}/preventivo/planes/responsables?tipoId=${otroTipoId}`,
        auth,
      );
      const sinTipo = await httpGet(`${baseUrl}/preventivo/planes/responsables`, auth);
      const tipoSinLectura = await httpGet(
        `${baseUrl}/preventivo/planes/responsables?tipoId=${tipoPreventivoId}`,
        auth,
      );

      expect(delOtroTipo.status).toBe(200);
      // Fuera el técnico de PREVENTIVO del mismo cliente (`responsableElegibleId`).
      expect(delOtroTipo.data.map((r) => r.id)).toEqual([tecnicoOtroTipo]);
      expect(sinTipo.status).toBe(400);
      expect(tipoSinLectura.status).toBe(403);
    });
  });

  it('sanity: DATABASE_URL_MASTER apunta a una DB *_test y el tenant es efímero *_test', () => {
    expect(MASTER_TEST_URL).toMatch(/_test$/);
    expect(TENANT_DB_NAME).toMatch(/^soporte_prov_prevE2E_.*_test$/);
  });
});
