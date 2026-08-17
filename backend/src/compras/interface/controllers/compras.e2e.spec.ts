/**
 * compras.e2e.spec.ts — cierre del hueco W-B del verify final
 * (`sdd/redisenio-modulo-compras/verify-report-final`): antes de este spec el
 * contrato HTTP de `ComprasController` estaba codificado DOS VECES por
 * separado —`compras.controller.spec.ts` instancia la clase a mano (sin
 * bootstrapear Nest ni pegarle a una URL) y el frontend intercepta con MSW
 * rutas LITERALES— y NINGUNA de las dos suites ejercitaba el par real. Un
 * rename de ruta en un decorador `@Post(...)` dejaba ambas en verde y rompía
 * producción. Este spec levanta la app REAL (contenedor de Nest, sin mocks
 * de infraestructura) y pega por HTTP a las 13 rutas — con los paths
 * LITERALES hardcodeados acá, NUNCA importados de `compras.controller.ts`
 * (si se importaran del mismo lugar que las define, un rename movería el
 * test junto con el código y dejaría de atrapar nada — ver `TABLA_RUTAS`).
 * De paso cierra también W-A (cero cobertura del grafo DI real): al pasar
 * por `Test.createTestingModule({ imports: [TestHarnessModule] }).compile()`
 * se compila `ComprasModule` completo con su `useFactory` real, no la
 * metadata leída a mano de `compras.module.spec.ts`.
 *
 * Mismo patrón que `tickets/interface/controllers/tickets.e2e.spec.ts`
 * (provisioning real de una DB tenant efímera) y `auth.e2e.spec.ts`/
 * `crear-cliente.e2e.spec.ts` (fetch nativo, sin supertest, truncate de
 * master en `beforeEach`) — replicado tal cual, sin inventar un patrón
 * nuevo.
 *
 * SEGURIDAD: provisiona UNA sola DB tenant efímera
 * (`soporte_prov_comprasE2E_<rand>_test`, prefijo `soporte_prov_`, sufijo
 * `_test`) vía `PostgresAdminService` + `TenantMigrationRunnerAdapter`, y la
 * borra en `afterAll` (orden `app.close()` → limpieza de filas →
 * `prismaService.onModuleDestroy()` → `dropDatabase`, EXACTO al de
 * `tickets.e2e.spec.ts` — dropear antes de cerrar la app deja el pool vivo y
 * Postgres rechaza el DROP EN SILENCIO, bug real encontrado en PR-14).
 * `master.clientes`/`roles`/`permisos`/`usuarios`/`membresias` (DB
 * compartida `soporte_master_test`) se truncan en `beforeEach`. NUNCA toca
 * `soporte_master`, `soporte_tenant_test`, ni `soporte_019fdb97da747aadafb40d3efcdb0cf7`
 * (tenant real "Demo Soporte" de `soporte_master`) — aislamiento total.
 *
 * A diferencia de `tickets.e2e.spec.ts`, este spec NO llama
 * `TenantSeederAdapter.seed()`: los catálogos que siembra (estados/
 * prioridades/tipos_ticket) son de `tickets/`, no de `compras/` — el único
 * dato de catálogo que el dominio de compras necesita (`CicloCliente`
 * activo) se crea a mano en `beforeAll`, igual que hace `tickets.e2e.spec.ts`
 * con el suyo.
 *
 * Ref verify: sdd/redisenio-modulo-compras/verify-report-final (W-B, W-A).
 * Ref spec: sdd/redisenio-modulo-compras/spec §4.1-§4.11, §5. Ref decisión:
 * sdd/redisenio-modulo-compras/rbac-consultas (las 3 consultas SIN permiso
 * fino — comportamiento intencional, testeado como tal más abajo).
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

import { SharedModule } from '../../../shared/shared.module';
import { AuthModule } from '../../../auth/auth.module';
import { ComprasModule } from '../../compras.module';
import { TenantScopeMiddleware } from '../../../shared/tenancy/tenant-scope.middleware';

import { PrismaService } from '../../../shared/infrastructure/persistence/prisma.service';
import {
  MasterPrismaClient,
  TenantPrismaClient,
} from '../../../shared/infrastructure/persistence/prisma-clients';
import { PostgresAdminService } from '../../../clientes/infrastructure/postgres-admin.service';
import { TenantMigrationRunnerAdapter } from '../../../clientes/infrastructure/tenant-migration-runner.adapter';
import { PrismaClienteRepository } from '../../../clientes/infrastructure/persistence/prisma/prisma-cliente.repository';
import { PrismaUsuarioRepository } from '../../../auth/infrastructure/persistence/prisma/prisma-usuario.repository';
import { PrismaMatrizPermisosRepository } from '../../../auth/infrastructure/persistence/prisma/prisma-matriz-permisos.repository';
import { ClienteEntity } from '../../../clientes/domain/entities/cliente.entity';
import { UsuarioEntity } from '../../../auth/domain/entities/usuario.entity';
import { RoleEntity } from '../../../auth/domain/entities/role.entity';
import { PermisoEntity } from '../../../auth/domain/entities/permiso.entity';
import { Argon2HashProvider } from '../../../auth/infrastructure/argon2-hash.provider';
import {
  CompraDetalleResponseDto,
  ItemCompraResponseDto,
  ListarComprasResponseDto,
} from '../dtos/compras.dto';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const TENANT_DB_NAME = `soporte_prov_comprasE2E_${randomBytes(4).toString('hex')}_test`;
const PLAINTEXT_PASSWORD = 'E2eComprasSecret!123';

// ─── Helpers HTTP (fetch nativo, mismo patrón que auth.e2e.spec.ts/tickets.e2e.spec.ts) ──

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

async function httpDelete<T = unknown>(
  url: string,
  headers: Headers = {},
): Promise<{ status: number; data: T }> {
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { Accept: 'application/json', ...headers },
  });
  const data = (await res.json().catch(() => null)) as T;
  return { status: res.status, data };
}

function bearer(token: string): Headers {
  return { Authorization: `Bearer ${token}` };
}

@Module({ imports: [SharedModule, AuthModule, ComprasModule] })
class TestHarnessModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantScopeMiddleware).forRoutes('*');
  }
}

// ─── Tabla de las 13 rutas (§ requisito duro #1: paths LITERALES, NUNCA ────
// importados de `compras.controller.ts` — si se importaran del mismo lugar
// que las define, un rename de ruta movería el test junto con el código y
// dejaría de atrapar nada). Los `:id`/`:itemId` son UUIDs sintéticos
// inexistentes: no importa su existencia real porque `JwtAuthGuard` corta
// ANTES de que el controller toque la DB — alcanza con que el ROUTING
// matchee el path+método.
const ID = '00000000-0000-4000-8000-000000000001';
const ITEM_ID = '00000000-0000-4000-8000-000000000002';

type Metodo = 'GET' | 'POST' | 'PATCH' | 'DELETE';

/**
 * WU-7.3 (sdd/matriz-permisos-por-usuario): las celdas reemplazan a los
 * permisos RBAC `compra:gestionar`/`compra:aprobar` — con el mapeo EXACTO
 * que aplica `ComprasController` (ver design-parte2, mapa de gates):
 * ALTAS (alta de compra/ítem), MODIFICACION (editar/registrar avance/cerrar
 * con faltante), BORRADO (eliminar ítem/cancelar compra), APROBACION
 * (aprobar/rechazar), LECTURA (las 3 consultas — R7, ya no "sin gate").
 */
interface RutaEsperada {
  metodo: Metodo;
  path: string;
  accion:
    | 'COMPRAS:ALTAS'
    | 'COMPRAS:MODIFICACION'
    | 'COMPRAS:BORRADO'
    | 'COMPRAS:APROBACION'
    | 'COMPRAS:LECTURA';
}

/**
 * WU-25 (`compras-tres-etapas-y-sectores`): 13 -> 15 rutas. `registrar-compra`
 * se renombra a `registrar-recepcion` (mismo verbo HTTP, mismo gate);
 * `registrar-orden` es la etapa nueva; `PATCH .../fecha-etapa` es la edición
 * de fecha independiente (R4/S55).
 */
const TABLA_RUTAS: RutaEsperada[] = [
  { metodo: 'POST', path: '/compras', accion: 'COMPRAS:ALTAS' },
  { metodo: 'POST', path: `/compras/${ID}/items`, accion: 'COMPRAS:ALTAS' },
  { metodo: 'PATCH', path: `/compras/${ID}/items/${ITEM_ID}`, accion: 'COMPRAS:MODIFICACION' },
  { metodo: 'DELETE', path: `/compras/${ID}/items/${ITEM_ID}`, accion: 'COMPRAS:BORRADO' },
  {
    metodo: 'POST',
    path: `/compras/${ID}/items/${ITEM_ID}/aprobar`,
    accion: 'COMPRAS:APROBACION',
  },
  {
    metodo: 'POST',
    path: `/compras/${ID}/items/${ITEM_ID}/rechazar`,
    accion: 'COMPRAS:APROBACION',
  },
  {
    metodo: 'POST',
    path: `/compras/${ID}/items/${ITEM_ID}/registrar-orden`,
    accion: 'COMPRAS:MODIFICACION',
  },
  {
    metodo: 'POST',
    path: `/compras/${ID}/items/${ITEM_ID}/registrar-recepcion`,
    accion: 'COMPRAS:MODIFICACION',
  },
  {
    metodo: 'POST',
    path: `/compras/${ID}/items/${ITEM_ID}/registrar-entrega`,
    accion: 'COMPRAS:MODIFICACION',
  },
  {
    metodo: 'PATCH',
    path: `/compras/${ID}/items/${ITEM_ID}/fecha-etapa`,
    accion: 'COMPRAS:MODIFICACION',
  },
  {
    metodo: 'POST',
    path: `/compras/${ID}/items/${ITEM_ID}/cerrar-con-faltante`,
    accion: 'COMPRAS:MODIFICACION',
  },
  { metodo: 'POST', path: `/compras/${ID}/cancelar`, accion: 'COMPRAS:BORRADO' },
  { metodo: 'GET', path: '/compras', accion: 'COMPRAS:LECTURA' },
  { metodo: 'GET', path: `/compras/${ID}`, accion: 'COMPRAS:LECTURA' },
  { metodo: 'GET', path: `/compras/${ID}/operaciones`, accion: 'COMPRAS:LECTURA' },
];

/** Rutas de escritura NO-APROBACION (ALTAS/MODIFICACION/BORRADO) — reemplaza a "RUTAS_GESTION". */
const RUTAS_ESCRITURA = TABLA_RUTAS.filter(
  (r) => r.accion !== 'COMPRAS:APROBACION' && r.accion !== 'COMPRAS:LECTURA',
);
const RUTAS_APROBAR = TABLA_RUTAS.filter((r) => r.accion === 'COMPRAS:APROBACION');
const RUTAS_CONSULTA = TABLA_RUTAS.filter((r) => r.accion === 'COMPRAS:LECTURA');

describe('Compras e2e — contrato HTTP real de las 13 rutas (cierra W-B/W-A del verify final)', () => {
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

  let cicloActivoId: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL_MASTER) {
      process.env.DATABASE_URL_MASTER = MASTER_TEST_URL;
    }

    // Provisiona + migra la DB tenant efímera REAL (nunca toca DBs compartidas).
    await admin.createDatabase(TENANT_DB_NAME);
    await new TenantMigrationRunnerAdapter(MASTER_TEST_URL).run(TENANT_DB_NAME);

    prismaService = new PrismaService(MASTER_TEST_URL);
    masterClient = prismaService.getMasterClient();
    tenantClient = prismaService.getTenantClient(TENANT_DB_NAME);
    clienteRepo = new PrismaClienteRepository(prismaService);
    usuarioRepo = new PrismaUsuarioRepository(prismaService);
    permisosRepo = new PrismaMatrizPermisosRepository(prismaService);
    hashProvider = new Argon2HashProvider();

    const cicloActivo = await tenantClient.cicloCliente.create({
      data: {
        cicloVigenteId: '01900000-0000-7000-8000-000000000001',
        nombre: 'E2E Ciclo Activo Compras',
        fechaInicio: new Date('2026-01-01'),
        fechaFin: new Date('2026-12-31'),
        activo: true,
      },
    });
    cicloActivoId = cicloActivo.id;

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
    // Orden CRÍTICO (bug real de PR-14): app.close() SIEMPRE antes de
    // dropDatabase — si se dropea con el pool todavía vivo, Postgres
    // rechaza el DROP en silencio y queda una DB huérfana.
    try {
      await app?.close();
    } catch {
      /* no-op */
    }
    try {
      await tenantClient.cicloCliente.delete({ where: { id: cicloActivoId } });
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
    // usuario_cliente_permisos (WU-2, sdd/matriz-permisos-por-usuario) NO
    // tiene FK declarada hacia usuarios/clientes — el TRUNCATE CASCADE de
    // las tablas viejas no la alcanza, hay que listarla explícitamente
    // (mismo gotcha documentado en auth.e2e.spec.ts, tanda 2).
    await masterClient.$executeRawUnsafe(
      'TRUNCATE TABLE membresias, refresh_tokens, roles_permisos, usuario_cliente_permisos, usuario_cliente_modulos, usuarios, clientes, roles, permisos RESTART IDENTITY CASCADE',
    );
  });

  // ─── Fixtures (master) ──────────────────────────────────────────────────

  async function crearClienteTenant(): Promise<ClienteEntity> {
    const cliente = ClienteEntity.create({
      nombre: `E2E Compras ${randomBytes(3).toString('hex')}`,
      razonSocial: null,
      cuit: null,
      dbName: TENANT_DB_NAME,
      activo: true,
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

  async function createUsuario(suffix: string): Promise<UsuarioEntity> {
    const usuario = UsuarioEntity.create({
      email: `e2e_compras_${suffix}@test.local`,
      nombre: 'E2E',
      apellido: 'Compras',
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

  async function login(email: string): Promise<{ accessToken: string }> {
    const { data } = await httpPost<{ accessToken: string }>(`${baseUrl}/auth/login`, {
      email,
      password: PLAINTEXT_PASSWORD,
    });
    return data;
  }

  /**
   * Actor con exactamente las celdas `CodigoAccion` pedidas, sembradas
   * directo en la matriz nueva (`usuario_cliente_permisos`, WU-7.1/7.3).
   *
   * El rol se crea con un código DISTINTO de 'ADMINISTRADOR' A PROPÓSITO:
   * `resolverScope` (WU-7.1, R2) bypassea TODAS las acciones para
   * `rol === 'ADMINISTRADOR'` — si el fixture usara ese código, el actor
   * recibiría el catálogo completo sin importar qué celdas se le sembraron,
   * y las aserciones de "SOLO tiene X" de esta suite (RBAC real por ruta)
   * quedarían mudas. `roles_permisos` (RBAC viejo) ya NO alimenta
   * `payload.permisos` — sembrar un rol con permisos ahí no tiene efecto.
   */
  async function crearActorConPermisos(
    permisos: string[],
  ): Promise<{ accessToken: string; clienteId: string; usuarioId: string }> {
    const cliente = await crearClienteTenant();
    const role = await createRoleConPermisos(`ROL_E2E_${randomBytes(3).toString('hex')}`, []);
    const usuario = await createUsuario(randomBytes(3).toString('hex'));
    await createMembresia(usuario.id, cliente.id, role.id);
    await permisosRepo.setPermisos(usuario.id, cliente.id, permisos);
    const { accessToken } = await login(usuario.email);
    return { accessToken, clienteId: cliente.id, usuarioId: usuario.id };
  }

  async function callMethod(
    metodo: Metodo,
    path: string,
    token?: string,
  ): Promise<{ status: number; data: unknown }> {
    const url = `${baseUrl}${path}`;
    const headers = token ? bearer(token) : {};
    if (metodo === 'GET') return httpGet(url, headers);
    if (metodo === 'DELETE') return httpDelete(url, headers);
    if (metodo === 'PATCH') return httpPatch(url, {}, headers);
    return httpPost(url, {}, headers);
  }

  function buildCrearCompraDto(overrides: Record<string, unknown> = {}) {
    return { motivo: 'Compra E2E', fechaSolicitud: '2026-06-01', ...overrides };
  }

  function buildAgregarItemDto(cantidad = 10, overrides: Record<string, unknown> = {}) {
    return {
      descripcion: 'Item E2E',
      cantidad,
      proveedor: 'Proveedor E2E',
      monto: 1000,
      moneda: 'ARS',
      fechaCotizacion: '2026-06-01',
      ...overrides,
    };
  }

  // ─── Requisito 1 — Existencia y forma de las 13 rutas (paths LITERALES) ──

  describe('Existencia + forma de las 13 rutas (paths LITERALES → atrapa un rename de ruta)', () => {
    it.each(TABLA_RUTAS)(
      '$metodo $path existe: sin Bearer → 401 (NUNCA 404 de routing — si el path fue renombrado, este assert falla)',
      async ({ metodo, path }) => {
        const { status } = await callMethod(metodo, path);
        expect(status).toBe(401);
      },
    );
  });

  // ─── Requisito 2 — Gating de acceso (JWT + módulo) ───────────────────────

  describe('Gating de acceso', () => {
    it('sin JWT → 401', async () => {
      const { status } = await httpGet(`${baseUrl}/compras`);
      expect(status).toBe(401);
    });

    it('autenticado pero SIN ninguna celda de COMPRAS en la matriz → 403, en un comando Y en una consulta', async () => {
      const actor = await crearActorConPermisos([]);

      const comando = await httpPost(
        `${baseUrl}/compras`,
        buildCrearCompraDto(),
        bearer(actor.accessToken),
      );
      const consulta = await httpGet(`${baseUrl}/compras`, bearer(actor.accessToken));

      expect(comando.status).toBe(403);
      expect(consulta.status).toBe(403);
    });
  });

  // ─── Requisito 3 — RBAC real por ruta ────────────────────────────────────

  describe('RBAC real por ruta (§4.11, WU-7.3 sdd/matriz-permisos-por-usuario)', () => {
    it.each(RUTAS_ESCRITURA)(
      '$metodo $path exige $accion: actor con SOLO COMPRAS:APROBACION → 403',
      async ({ metodo, path }) => {
        const actor = await crearActorConPermisos(['COMPRAS:APROBACION']);
        const { status } = await callMethod(metodo, path, actor.accessToken);
        expect(status).toBe(403);
      },
    );

    it.each(RUTAS_APROBAR)(
      '$metodo $path exige COMPRAS:APROBACION: actor con SOLO COMPRAS:ALTAS/MODIFICACION/BORRADO → 403',
      async ({ metodo, path }) => {
        const actor = await crearActorConPermisos([
          'COMPRAS:ALTAS',
          'COMPRAS:MODIFICACION',
          'COMPRAS:BORRADO',
        ]);
        const { status } = await callMethod(metodo, path, actor.accessToken);
        expect(status).toBe(403);
      },
    );

    it.each(RUTAS_CONSULTA)(
      '$metodo $path exige SOLO COMPRAS:LECTURA: actor sin ningún permiso de escritura → nunca 403 (rbac-consultas, decisión intencional traducida a la celda LECTURA)',
      async ({ metodo, path }) => {
        const actor = await crearActorConPermisos(['COMPRAS:LECTURA']);
        const { status } = await callMethod(metodo, path, actor.accessToken);
        expect(status).not.toBe(403);
      },
    );
  });

  // ─── Requisito 4 — Flujo feliz end-to-end ────────────────────────────────

  describe('Flujo feliz end-to-end', () => {
    it('crear compra → agregar ítem → aprobar → registrar-compra → registrar-entrega, atravesando la app real', async () => {
      const actor = await crearActorConPermisos([
        'COMPRAS:ALTAS',
        'COMPRAS:MODIFICACION',
        'COMPRAS:BORRADO',
        'COMPRAS:APROBACION',
        'COMPRAS:LECTURA',
      ]);

      const crear = await httpPost<CompraDetalleResponseDto>(
        `${baseUrl}/compras`,
        buildCrearCompraDto(),
        bearer(actor.accessToken),
      );
      expect(crear.status).toBe(201);
      expect(crear.data.estado).toBe('PENDIENTE');
      expect(crear.data.items).toHaveLength(0);
      const compraId = crear.data.id;

      const agregar = await httpPost<CompraDetalleResponseDto>(
        `${baseUrl}/compras/${compraId}/items`,
        buildAgregarItemDto(10),
        bearer(actor.accessToken),
      );
      expect(agregar.status).toBe(201);
      expect(agregar.data.items).toHaveLength(1);
      expect(agregar.data.items[0].estadoAprobacion).toBe('PENDIENTE');
      const itemId = agregar.data.items[0].id;

      const aprobar = await httpPost<ItemCompraResponseDto>(
        `${baseUrl}/compras/${compraId}/items/${itemId}/aprobar`,
        {},
        bearer(actor.accessToken),
      );
      expect(aprobar.status).toBe(200);
      expect(aprobar.data.estadoAprobacion).toBe('APROBADO');
      expect(aprobar.data.decididoPorId).toBe(actor.usuarioId);

      const registrarOrden = await httpPost<ItemCompraResponseDto>(
        `${baseUrl}/compras/${compraId}/items/${itemId}/registrar-orden`,
        { cantidadOrdenada: 10 },
        bearer(actor.accessToken),
      );
      expect(registrarOrden.status).toBe(200);
      expect(registrarOrden.data.cantidadOrdenada).toBe(10);

      const registrarRecepcion = await httpPost<ItemCompraResponseDto>(
        `${baseUrl}/compras/${compraId}/items/${itemId}/registrar-recepcion`,
        { cantidadRecibida: 10 },
        bearer(actor.accessToken),
      );
      expect(registrarRecepcion.status).toBe(200);
      expect(registrarRecepcion.data.cantidadRecibida).toBe(10);
      expect(registrarRecepcion.data.comprado).toBe(true);

      const registrarEntrega = await httpPost<ItemCompraResponseDto>(
        `${baseUrl}/compras/${compraId}/items/${itemId}/registrar-entrega`,
        { cantidadEntregada: 10 },
        bearer(actor.accessToken),
      );
      expect(registrarEntrega.status).toBe(200);
      expect(registrarEntrega.data.cantidadEntregada).toBe(10);
      expect(registrarEntrega.data.entregado).toBe(true);

      const detalleFinal = await httpGet<CompraDetalleResponseDto>(
        `${baseUrl}/compras/${compraId}`,
        bearer(actor.accessToken),
      );
      expect(detalleFinal.status).toBe(200);
      expect(detalleFinal.data.estado).toBe('APROBADO');
      expect(detalleFinal.data.comprado).toBe(true);
      expect(detalleFinal.data.cerrado).toBe(true);
    });
  });

  // ─── Requisito 5 — Errores de dominio por HTTP (422/404/409, spec §5) ────

  describe('Errores de dominio por HTTP (spec §5)', () => {
    it('404 CompraNoEncontradaError: GET /compras/:id con id inexistente', async () => {
      const actor = await crearActorConPermisos([
        'COMPRAS:ALTAS',
        'COMPRAS:MODIFICACION',
        'COMPRAS:BORRADO',
        'COMPRAS:LECTURA',
      ]);

      const { status } = await httpGet(
        `${baseUrl}/compras/00000000-0000-4000-8000-000000000099`,
        bearer(actor.accessToken),
      );

      expect(status).toBe(404);
    });

    it('422 ItemCompraNoAprobadoError: registrar-orden sobre un ítem todavía PENDIENTE (S47)', async () => {
      const actor = await crearActorConPermisos([
        'COMPRAS:ALTAS',
        'COMPRAS:MODIFICACION',
        'COMPRAS:BORRADO',
        'COMPRAS:LECTURA',
      ]);
      const crear = await httpPost<CompraDetalleResponseDto>(
        `${baseUrl}/compras`,
        buildCrearCompraDto(),
        bearer(actor.accessToken),
      );
      const agregar = await httpPost<CompraDetalleResponseDto>(
        `${baseUrl}/compras/${crear.data.id}/items`,
        buildAgregarItemDto(),
        bearer(actor.accessToken),
      );
      const itemId = agregar.data.items[0].id;

      const { status } = await httpPost(
        `${baseUrl}/compras/${crear.data.id}/items/${itemId}/registrar-orden`,
        { cantidadOrdenada: 5 },
        bearer(actor.accessToken),
      );

      expect(status).toBe(422);
    });

    /**
     * Fix post-verify W6: `sectorId` con formato UUID válido pero
     * inexistente. ANTES del fix, esto pasaba sin validar hasta el
     * `INSERT` — el FK `compras_sector_id_fkey` lo rechazaba como un
     * `PrismaClientKnownRequestError` sin mapear, un 500 alcanzable por
     * HTTP. Solo un request real (no un unit test, que mockea el
     * repositorio de sectores fuera de la ecuación) prueba que el guard
     * está WIREADO de punta a punta.
     */
    it('422 SectorInexistenteError (W6): crear una compra con sectorId inexistente, NUNCA 500', async () => {
      const actor = await crearActorConPermisos([
        'COMPRAS:ALTAS',
        'COMPRAS:MODIFICACION',
        'COMPRAS:BORRADO',
        'COMPRAS:LECTURA',
      ]);

      const { status } = await httpPost<{ message: string }>(
        `${baseUrl}/compras`,
        buildCrearCompraDto({ sectorId: '00000000-0000-4000-8000-000000000fff' }),
        bearer(actor.accessToken),
      );

      expect(status).toBe(422);
    });

    /**
     * 409 SinCicloActivoError (S2) — bug real descubierto al escribir este
     * spec (histórico, YA CORREGIDO — ver `ResolverCicloActivoCompra`,
     * `sdd/redisenio-modulo-compras/fix-ciclo-activo-cross-module`):
     * `CrearCompraUseCase` resolvía el ciclo activo vía
     * `ResolverCicloActivoParaCreacion` REUTILIZADO tal cual de
     * `tickets/application/services/resolver-ciclo-activo.service.ts`, que
     * fallaba con `SinCicloActivoError` de `tickets/domain/errors` — NO de
     * `compras/domain/errors`. Dos clases DISTINTAS con el mismo
     * nombre/código (`SIN_CICLO_ACTIVO`) pero mensajes distintos ("...no se
     * puede crear el ticket." vs "...no se puede crear la compra."). Como
     * `ComprasController.toHttpException` sólo chequea `instanceof` contra
     * la clase de COMPRAS, el error real (instancia de la clase de TICKETS)
     * nunca matcheaba esa rama y caía al default → 422, no 409 — filtrando
     * además el mensaje de TICKETS a la API de compras.
     * `compras.controller.spec.ts` (unit) no lo detectaba porque construye
     * `Result.fail(new ComprasErrors.SinCicloActivoError())` a mano, sin
     * pasar por el resolver real. Este test ejercita el camino REAL
     * (resolver -> use case -> controller -> HTTP) para que un regreso del
     * bug rompa acá.
     */
    it('409 SinCicloActivoError: crear una compra sin ciclo activo devuelve 409 con el mensaje de COMPRAS', async () => {
      await tenantClient.cicloCliente.update({
        where: { id: cicloActivoId },
        data: { activo: false },
      });
      try {
        const actor = await crearActorConPermisos([
          'COMPRAS:ALTAS',
          'COMPRAS:MODIFICACION',
          'COMPRAS:BORRADO',
          'COMPRAS:LECTURA',
        ]);

        const { status, data } = await httpPost<{ message: string }>(
          `${baseUrl}/compras`,
          buildCrearCompraDto(),
          bearer(actor.accessToken),
        );

        expect(status).toBe(409);
        expect(data.message).toBe(
          'No hay un ciclo activo en este tenant. No se puede crear la compra.',
        );
        expect(data.message).not.toMatch(/crear el ticket/);
      } finally {
        await tenantClient.cicloCliente.update({
          where: { id: cicloActivoId },
          data: { activo: true },
        });
      }
    });

    it('409 NumeradorCompraAgotadoError: secuencia anual agotada (S3, overflow guard)', async () => {
      const anio = new Date().getFullYear();
      const numeroTope = `COM-${anio}-99999`;
      const filaTope = await tenantClient.compra.create({
        data: {
          numero: numeroTope,
          fechaSolicitud: new Date(`${anio}-01-01`),
          motivo: 'Fila de tope para agotar el numerador (fixture e2e)',
          solicitanteId: '00000000-0000-4000-8000-000000000ccc',
          cicloId: cicloActivoId,
        },
      });
      try {
        const actor = await crearActorConPermisos([
          'COMPRAS:ALTAS',
          'COMPRAS:MODIFICACION',
          'COMPRAS:BORRADO',
          'COMPRAS:LECTURA',
        ]);

        const { status } = await httpPost(
          `${baseUrl}/compras`,
          buildCrearCompraDto(),
          bearer(actor.accessToken),
        );

        expect(status).toBe(409);
      } finally {
        await tenantClient.compra.delete({ where: { id: filaTope.id } });
      }
    });
  });

  // ─── Requisito 6 — Invariante de los 3 campos server-side ────────────────

  describe('Invariante: numero/solicitanteId/cicloId NUNCA vienen del body HTTP', () => {
    it('enviar numero/solicitanteId/cicloId en el body de POST /compras no tiene efecto — los 3 valores resueltos por el servidor ganan', async () => {
      const actor = await crearActorConPermisos([
        'COMPRAS:ALTAS',
        'COMPRAS:MODIFICACION',
        'COMPRAS:BORRADO',
        'COMPRAS:LECTURA',
      ]);
      const solicitanteFalso = '00000000-0000-4000-8000-0000000000ee';
      const cicloFalso = '00000000-0000-4000-8000-0000000000ff';

      const { status, data } = await httpPost<CompraDetalleResponseDto>(
        `${baseUrl}/compras`,
        {
          ...buildCrearCompraDto(),
          numero: 'COM-FAKE-99999',
          solicitanteId: solicitanteFalso,
          cicloId: cicloFalso,
        },
        bearer(actor.accessToken),
      );

      expect(status).toBe(201);
      // numero: lo emite NumeradorCompra, formato COM-{anio}-{00000}.
      expect(data.numero).not.toBe('COM-FAKE-99999');
      expect(data.numero).toMatch(/^COM-\d{4}-\d{5}$/);
      // solicitanteId: SIEMPRE JWT.sub del actor autenticado.
      expect(data.solicitanteId).toBe(actor.usuarioId);
      expect(data.solicitanteId).not.toBe(solicitanteFalso);
      // cicloId: SIEMPRE el ciclo activo resuelto server-side.
      expect(data.cicloId).toBe(cicloActivoId);
      expect(data.cicloId).not.toBe(cicloFalso);
    });
  });

  // ─── Requisito 7 — Querystring de filtros (WU-14) ────────────────────────
  //
  // Un solo `it` de E2E confirma que el querystring llega y se parsea. Las
  // 14 filas de la matriz "en curso" viven en integración
  // (prisma-compra.repository.filtros.integration.spec.ts, WU-12) — es
  // donde está el riesgo real y el ciclo de feedback más corto; no se
  // duplica esa matriz por HTTP.

  describe('Querystring de filtros (WU-14)', () => {
    it('GET /compras?cicloId&soloEnCurso&sectorId&fechaDesde&fechaHasta parsea sin 400 y filtra por cicloId', async () => {
      const actor = await crearActorConPermisos([
        'COMPRAS:ALTAS',
        'COMPRAS:MODIFICACION',
        'COMPRAS:BORRADO',
        'COMPRAS:LECTURA',
      ]);
      const crear = await httpPost<CompraDetalleResponseDto>(
        `${baseUrl}/compras`,
        buildCrearCompraDto(),
        bearer(actor.accessToken),
      );

      // sectorId se omite a propósito: la compra recién creada no tiene
      // sector asignado, y filtrar por un sectorId inventado la excluiría
      // legítimamente — este test valida PARSEO del querystring (los 5
      // params juntos, sin 400), no la semántica de cada filtro (eso vive
      // en la matriz de integración de WU-12).
      const query = new URLSearchParams({
        cicloId: crear.data.cicloId,
        soloEnCurso: 'false',
        fechaDesde: '2020-01-01',
        fechaHasta: '2030-01-01',
      });
      const { status, data } = await httpGet<ListarComprasResponseDto>(
        `${baseUrl}/compras?${query.toString()}`,
        bearer(actor.accessToken),
      );

      expect(status).toBe(200);
      expect(data.items.some((i) => i.id === crear.data.id)).toBe(true);

      // Con `sectorId` sumado al querystring (los 5 juntos): sigue
      // parseando sin 400 — sanity de que class-validator no lo rechaza.
      const queryConSector = new URLSearchParams({
        ...Object.fromEntries(query),
        sectorId: '00000000-0000-4000-8000-000000000abc',
      });
      const conSector = await httpGet<ListarComprasResponseDto>(
        `${baseUrl}/compras?${queryConSector.toString()}`,
        bearer(actor.accessToken),
      );
      expect(conSector.status).toBe(200);
    });
  });

  // ─── Sanity ───────────────────────────────────────────────────────────────

  it('sanity: DATABASE_URL_MASTER apunta a una DB *_test y el tenant es efímero *_test', () => {
    expect(MASTER_TEST_URL).toMatch(/_test$/);
    expect(TENANT_DB_NAME).toMatch(/^soporte_prov_comprasE2E_.*_test$/);
  });
});
