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
 * `soporte_master`, `soporte_tenant_test`, ni la base de ningún tenant real
 * (su `db_name` vive en `soporte_master.clientes` y cambia si el tenant se
 * recrea, por eso no se hardcodea acá) — aislamiento total.
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
import { usarLockMasterTest } from '../../../testing/lock-master-test';

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
 *
 * Editar cabecera: 15 -> 16 rutas. `PATCH /compras/:id` va ANTES de
 * `PATCH /compras/:id/items/:itemId` en esta tabla sólo por legibilidad — no
 * hay ambigüedad de routing entre las dos: distinta profundidad de path.
 */
const TABLA_RUTAS: RutaEsperada[] = [
  { metodo: 'POST', path: '/compras', accion: 'COMPRAS:ALTAS' },
  { metodo: 'POST', path: `/compras/${ID}/items`, accion: 'COMPRAS:ALTAS' },
  { metodo: 'PATCH', path: `/compras/${ID}`, accion: 'COMPRAS:MODIFICACION' },
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

// Turno exclusivo sobre la master de test compartida — ver src/testing/lock-master-test.ts.
usarLockMasterTest();

describe('Compras e2e — contrato HTTP real de las 16 rutas (cierra W-B/W-A del verify final)', () => {
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
  /** Familia y unidad del catálogo de insumos: las FK que todo insumo necesita. */
  let familiaInsumoId: string;
  let unidadMedidaId: string;

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

    // Catálogo mínimo de insumos (insumos-entrega-3): se siembra directo en el
    // tenant y no por HTTP porque su ABM está detrás de `AdminClienteGuard`,
    // un modelo de autorización distinto del que esta suite ejercita. Es el
    // mismo criterio con el que el ciclo activo se crea a mano acá arriba.
    const familia = await tenantClient.familiaInsumo.create({
      data: { codigo: `FAM-E2E-${randomBytes(3).toString('hex')}`, nombre: 'Familia E2E' },
    });
    familiaInsumoId = familia.id;
    const unidad = await tenantClient.unidadMedida.create({
      data: { codigo: `UM-E2E-${randomBytes(3).toString('hex')}`, nombre: 'Unidad E2E' },
    });
    unidadMedidaId = unidad.id;

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
    // roles_permisos/permisos/usuario_cliente_modulos ya NO existen
    // (migración drop_legacy_rbac_tablas_muertas, converge con WU-9 en
    // producción).
    await masterClient.$executeRawUnsafe(
      'TRUNCATE TABLE membresias, refresh_tokens, usuario_cliente_permisos, usuarios, clientes, roles RESTART IDENTITY CASCADE',
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

  // `permisoCodigos` ya NO siembra `roles_permisos`/`permisos` (RBAC viejo,
  // tablas eliminadas — migración drop_legacy_rbac_tablas_muertas):
  // `crearActorConPermisos` (abajo) siempre llama esta función con `[]` y
  // siembra los permisos reales vía `permisosRepo.setPermisos` (matriz
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

  /**
   * Insumo NUEVO en el catálogo del tenant, uno por caso. Uno compartido haría
   * que los movimientos de un test se sumaran a los del siguiente y las
   * aserciones de conteo pasarían por la razón equivocada — el `beforeEach`
   * trunca master, no el tenant.
   */
  async function crearInsumoEnCatalogo(activo = true): Promise<string> {
    const insumo = await tenantClient.insumo.create({
      data: {
        codigo: `INS-E2E-${randomBytes(4).toString('hex').toUpperCase()}`,
        nombre: 'Tóner negro E2E',
        familiaId: familiaInsumoId,
        unidadMedidaId,
        activo,
      },
    });
    return insumo.id;
  }

  /** Asientos de la bitácora de existencias de un insumo, del más viejo al más nuevo. */
  async function movimientosDe(
    insumoId: string,
  ): Promise<{ tipo: string; cantidad: number; itemCompraId: string | null }[]> {
    const filas = await tenantClient.movimientoInsumo.findMany({
      where: { insumoId },
      orderBy: { createdAt: 'asc' },
    });
    return filas.map((fila) => ({
      tipo: fila.tipo,
      cantidad: Number(fila.cantidad),
      itemCompraId: fila.itemCompraId,
    }));
  }

  /** Compra con UN ítem aprobado y su orden emitida: el estado desde el que se recibe. */
  async function compraConItemListoParaRecibir(
    token: string,
    cantidad: number,
    itemOverrides: Record<string, unknown> = {},
  ): Promise<{ compraId: string; itemId: string }> {
    const crear = await httpPost<CompraDetalleResponseDto>(
      `${baseUrl}/compras`,
      buildCrearCompraDto(),
      bearer(token),
    );
    expect(crear.status).toBe(201);
    const compraId = crear.data.id;

    const agregar = await httpPost<CompraDetalleResponseDto>(
      `${baseUrl}/compras/${compraId}/items`,
      buildAgregarItemDto(cantidad, itemOverrides),
      bearer(token),
    );
    expect(agregar.status).toBe(201);
    const itemId = agregar.data.items[0].id;

    expect(
      (await httpPost(`${baseUrl}/compras/${compraId}/items/${itemId}/aprobar`, {}, bearer(token)))
        .status,
    ).toBe(200);
    expect(
      (
        await httpPost(
          `${baseUrl}/compras/${compraId}/items/${itemId}/registrar-orden`,
          { cantidadOrdenada: cantidad },
          bearer(token),
        )
      ).status,
    ).toBe(200);

    return { compraId, itemId };
  }

  // ─── Requisito 1 — Existencia y forma de las 13 rutas (paths LITERALES) ──

  describe('Existencia + forma de las 16 rutas (paths LITERALES → atrapa un rename de ruta)', () => {
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

    it('editar cabecera: PATCH /compras/:id sobre una compra PENDIENTE persiste los campos y deja UNA operación COMPRA_EDITADA en la bitácora; tras aprobar un ítem, el mismo PATCH da 422', async () => {
      const actor = await crearActorConPermisos([
        'COMPRAS:ALTAS',
        'COMPRAS:MODIFICACION',
        'COMPRAS:APROBACION',
        'COMPRAS:LECTURA',
      ]);

      const crear = await httpPost<CompraDetalleResponseDto>(
        `${baseUrl}/compras`,
        buildCrearCompraDto(),
        bearer(actor.accessToken),
      );
      expect(crear.status).toBe(201);
      const compraId = crear.data.id;

      const editar = await httpPatch<CompraDetalleResponseDto>(
        `${baseUrl}/compras/${compraId}`,
        { motivo: 'Motivo corregido antes de aprobar', descripcion: 'Detalle agregado' },
        bearer(actor.accessToken),
      );
      expect(editar.status).toBe(200);
      expect(editar.data.motivo).toBe('Motivo corregido antes de aprobar');
      expect(editar.data.descripcion).toBe('Detalle agregado');

      // Releído desde la DB, no del cuerpo de la respuesta: prueba que el
      // UPDATE realmente se escribió, no sólo que la entidad mutó en memoria.
      const releido = await httpGet<CompraDetalleResponseDto>(
        `${baseUrl}/compras/${compraId}`,
        bearer(actor.accessToken),
      );
      expect(releido.data.motivo).toBe('Motivo corregido antes de aprobar');

      const bitacora = await httpGet<Array<{ tipo: string; itemCompraId: string | null }>>(
        `${baseUrl}/compras/${compraId}/operaciones`,
        bearer(actor.accessToken),
      );
      expect(bitacora.status).toBe(200);
      const ediciones = bitacora.data.filter((op) => op.tipo === 'COMPRA_EDITADA');
      expect(ediciones).toHaveLength(1);
      expect(ediciones[0].itemCompraId).toBeNull();

      // A partir de acá la compra ya no es PENDIENTE: se cierra la ventana.
      const agregar = await httpPost<CompraDetalleResponseDto>(
        `${baseUrl}/compras/${compraId}/items`,
        buildAgregarItemDto(1),
        bearer(actor.accessToken),
      );
      const itemId = agregar.data.items[0].id;
      await httpPost(
        `${baseUrl}/compras/${compraId}/items/${itemId}/aprobar`,
        {},
        bearer(actor.accessToken),
      );

      const editarTarde = await httpPatch(
        `${baseUrl}/compras/${compraId}`,
        { motivo: 'Ya no deberia poder' },
        bearer(actor.accessToken),
      );
      expect(editarTarde.status).toBe(422);

      const sinPisar = await httpGet<CompraDetalleResponseDto>(
        `${baseUrl}/compras/${compraId}`,
        bearer(actor.accessToken),
      );
      expect(sinPisar.data.motivo).toBe('Motivo corregido antes de aprobar');
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

    // ─── WU-25 (sdd/compras-orden-filtro-estado) ──────────────────────────
    //
    // Un solo `it` por HTTP: que `estado` viaje, se valide y se APLIQUE.
    // La semántica de cada grupo y el orden viven en integración
    // (prisma-compra.repository.orden/filtros.integration.spec.ts) — no se
    // duplican por HTTP.

    it('GET /compras?estado=... filtra por grupo, gana sobre soloEnCurso y rechaza un valor fuera del catálogo', async () => {
      const actor = await crearActorConPermisos(['COMPRAS:ALTAS', 'COMPRAS:LECTURA']);
      const crear = await httpPost<CompraDetalleResponseDto>(
        `${baseUrl}/compras`,
        buildCrearCompraDto(),
        bearer(actor.accessToken),
      );
      // Recién creada, sin ítems -> grupo ACTIVAS.
      const compraId = crear.data.id;

      const activas = await httpGet<ListarComprasResponseDto>(
        `${baseUrl}/compras?estado=ACTIVAS&porPagina=100`,
        bearer(actor.accessToken),
      );
      expect(activas.status).toBe(200);
      expect(activas.data.items.some((i) => i.id === compraId)).toBe(true);

      // `estado` GANA sobre `soloEnCurso=true`: pedir CANCELADAS deja fuera
      // a la compra activa, aunque `soloEnCurso` diga lo contrario.
      const canceladas = await httpGet<ListarComprasResponseDto>(
        `${baseUrl}/compras?estado=CANCELADAS&soloEnCurso=true&porPagina=100`,
        bearer(actor.accessToken),
      );
      expect(canceladas.status).toBe(200);
      expect(canceladas.data.items.some((i) => i.id === compraId)).toBe(false);

      // Sin `estado`, el default sigue siendo ACTIVAS (retrocompatibilidad).
      const porDefecto = await httpGet<ListarComprasResponseDto>(
        `${baseUrl}/compras?porPagina=100`,
        bearer(actor.accessToken),
      );
      expect(porDefecto.data.items.some((i) => i.id === compraId)).toBe(true);

      const invalido = await httpGet<ListarComprasResponseDto>(
        `${baseUrl}/compras?estado=EN_CURSO`,
        bearer(actor.accessToken),
      );
      expect(invalido.status).toBe(400);
    });
  });

  // ─── Sanity ───────────────────────────────────────────────────────────────

  describe('insumos-entrega-3 — el ítem declara su insumo y recibir sube el stock', () => {
    const PERMISOS = [
      'COMPRAS:ALTAS',
      'COMPRAS:MODIFICACION',
      'COMPRAS:APROBACION',
      'COMPRAS:LECTURA',
    ];

    /**
     * El camino completo por HTTP: declarar el insumo al crear el ítem y ver
     * la bitácora de existencias crecer sola al recibir, sin que nadie cargue
     * un movimiento aparte. La segunda recepción prueba además que se emite
     * por DELTA: el acumulado pasa de 4 a 10 y el asiento nuevo es de 6, no de
     * 10 — un asiento por el acumulado duplicaría el stock.
     */
    it('declarar el insumo y registrar la recepción asienta la ENTRADA sola, por delta y con el ítem como origen', async () => {
      const actor = await crearActorConPermisos(PERMISOS);
      const insumoId = await crearInsumoEnCatalogo();
      const { compraId, itemId } = await compraConItemListoParaRecibir(actor.accessToken, 10, {
        insumoId,
      });

      const detalle = await httpGet<CompraDetalleResponseDto>(
        `${baseUrl}/compras/${compraId}`,
        bearer(actor.accessToken),
      );
      expect(detalle.status).toBe(200);
      expect(detalle.data.items[0].insumoId).toBe(insumoId);
      expect(detalle.data.items[0].insumoSeguimiento).toBe('NINGUNO');

      const primera = await httpPost<ItemCompraResponseDto>(
        `${baseUrl}/compras/${compraId}/items/${itemId}/registrar-recepcion`,
        { cantidadRecibida: 4 },
        bearer(actor.accessToken),
      );
      expect(primera.status).toBe(200);
      expect(primera.data.cantidadRecibida).toBe(4);
      expect(await movimientosDe(insumoId)).toEqual([
        { tipo: 'ENTRADA', cantidad: 4, itemCompraId: itemId },
      ]);

      const segunda = await httpPost<ItemCompraResponseDto>(
        `${baseUrl}/compras/${compraId}/items/${itemId}/registrar-recepcion`,
        { cantidadRecibida: 10 },
        bearer(actor.accessToken),
      );
      expect(segunda.status).toBe(200);
      expect(await movimientosDe(insumoId)).toEqual([
        { tipo: 'ENTRADA', cantidad: 4, itemCompraId: itemId },
        { tipo: 'ENTRADA', cantidad: 6, itemCompraId: itemId },
      ]);
    });

    it('el detalle publica el seguimiento SERIE del insumo para quien recibe, sin exigirle INSUMOS:LECTURA', async () => {
      const actor = await crearActorConPermisos(PERMISOS);
      const insumoId = await crearInsumoEnCatalogo();
      await tenantClient.insumo.update({ where: { id: insumoId }, data: { seguimiento: 'SERIE' } });
      const { compraId } = await compraConItemListoParaRecibir(actor.accessToken, 3, { insumoId });

      const detalle = await httpGet<CompraDetalleResponseDto>(
        `${baseUrl}/compras/${compraId}`,
        bearer(actor.accessToken),
      );

      expect(detalle.status).toBe(200);
      expect(detalle.data.items[0].insumoSeguimiento).toBe('SERIE');
    });

    /**
     * La recepción no acepta `condicion`: el DTO no la declara y el
     * `ValidationPipe` global (`whitelist`, sin `forbidNonWhitelisted`) la
     * descarta en silencio, así que el request pasa (200) y el asiento queda
     * NUEVO aunque el body pidiera USADO.
     */
    it('una condicion USADO en el body de la recepción se descarta y el asiento queda NUEVO', async () => {
      const actor = await crearActorConPermisos(PERMISOS);
      const insumoId = await crearInsumoEnCatalogo();
      const { compraId, itemId } = await compraConItemListoParaRecibir(actor.accessToken, 10, {
        insumoId,
      });

      const recibir = await httpPost<ItemCompraResponseDto>(
        `${baseUrl}/compras/${compraId}/items/${itemId}/registrar-recepcion`,
        { cantidadRecibida: 3, condicion: 'USADO' },
        bearer(actor.accessToken),
      );

      expect(recibir.status).toBe(200);
      const filas = await tenantClient.movimientoInsumo.findMany({ where: { insumoId } });
      expect(filas).toHaveLength(1);
      expect(filas[0].condicion).toBe('NUEVO');
    });

    /**
     * Hermano invertido del anterior, y el que protege a los ítems ya
     * cargados: sin insumo declarado la recepción tiene que comportarse
     * exactamente como antes de esta entrega. El insumo del fixture existe y
     * queda en cero movimientos — no es un assert de ausencia sobre una tabla
     * vacía, porque el caso hermano prueba que ese mismo camino SÍ asienta.
     */
    it('el ítem de texto libre, sin insumo, se recibe igual que siempre y no mueve ningún stock', async () => {
      const actor = await crearActorConPermisos(PERMISOS);
      const insumoId = await crearInsumoEnCatalogo();
      const { compraId, itemId } = await compraConItemListoParaRecibir(actor.accessToken, 10);

      const recibir = await httpPost<ItemCompraResponseDto>(
        `${baseUrl}/compras/${compraId}/items/${itemId}/registrar-recepcion`,
        { cantidadRecibida: 10 },
        bearer(actor.accessToken),
      );
      expect(recibir.status).toBe(200);
      expect(recibir.data.cantidadRecibida).toBe(10);
      expect(recibir.data.insumoId).toBeNull();
      expect(await movimientosDe(insumoId)).toEqual([]);
    });

    /**
     * Decisión 5 del diseño, por HTTP: el stock ya sumado quedaría contado en
     * el insumo viejo. Lo que se verifica acá y ningún unit test puede es que
     * el error salga como 422 con su mensaje y no como el 500 que daría un
     * `DomainError` sin mapear.
     */
    it('reasignar el insumo de un ítem que ya recibió da 422 con su mensaje, nunca 500, y no toca el vínculo', async () => {
      const actor = await crearActorConPermisos(PERMISOS);
      const insumoId = await crearInsumoEnCatalogo();
      const otroInsumoId = await crearInsumoEnCatalogo();
      const { compraId, itemId } = await compraConItemListoParaRecibir(actor.accessToken, 10, {
        insumoId,
      });
      expect(
        (
          await httpPost(
            `${baseUrl}/compras/${compraId}/items/${itemId}/registrar-recepcion`,
            { cantidadRecibida: 10 },
            bearer(actor.accessToken),
          )
        ).status,
      ).toBe(200);

      const reasignar = await httpPatch<{ message: string }>(
        `${baseUrl}/compras/${compraId}/items/${itemId}`,
        { insumoId: otroInsumoId },
        bearer(actor.accessToken),
      );

      expect(reasignar.status).toBe(422);
      expect(reasignar.data.message).toContain('ya recibió mercadería');

      const detalle = await httpGet<CompraDetalleResponseDto>(
        `${baseUrl}/compras/${compraId}`,
        bearer(actor.accessToken),
      );
      expect(detalle.data.items[0].insumoId).toBe(insumoId);
      expect(await movimientosDe(otroInsumoId)).toEqual([]);
    });

    /**
     * Sin la verificación contra el catálogo, este id llega al `INSERT`, la FK
     * lo rechaza con `P2003` y el filtro de Prisma contesta 409 "la operación
     * afecta datos relacionados", que no dice cuál id está mal. El assert es
     * de contenido justamente para distinguir un 422 del otro.
     */
    it('declarar un insumoId inexistente da 422 nombrando el id, no el 409 genérico de la FK', async () => {
      const actor = await crearActorConPermisos(PERMISOS);
      const inexistente = '00000000-0000-4000-8000-0000000000ff';

      const crear = await httpPost<CompraDetalleResponseDto>(
        `${baseUrl}/compras`,
        buildCrearCompraDto(),
        bearer(actor.accessToken),
      );
      const agregar = await httpPost<{ message: string }>(
        `${baseUrl}/compras/${crear.data.id}/items`,
        buildAgregarItemDto(10, { insumoId: inexistente }),
        bearer(actor.accessToken),
      );

      expect(agregar.status).toBe(422);
      expect(agregar.data.message).toContain(inexistente);

      const detalle = await httpGet<CompraDetalleResponseDto>(
        `${baseUrl}/compras/${crear.data.id}`,
        bearer(actor.accessToken),
      );
      expect(detalle.data.items).toHaveLength(0);
    });

    it('un insumoId que ni siquiera es UUID lo rechaza el borde con 400, sin llegar a la columna @db.Uuid', async () => {
      const actor = await crearActorConPermisos(PERMISOS);
      const crear = await httpPost<CompraDetalleResponseDto>(
        `${baseUrl}/compras`,
        buildCrearCompraDto(),
        bearer(actor.accessToken),
      );

      const agregar = await httpPost(
        `${baseUrl}/compras/${crear.data.id}/items`,
        buildAgregarItemDto(10, { insumoId: 'no-es-uuid' }),
        bearer(actor.accessToken),
      );

      expect(agregar.status).toBe(400);
    });
  });

  describe('repuestos-numero-de-serie — recepción de un insumo SERIE (ADR-11)', () => {
    const PERMISOS = [
      'COMPRAS:ALTAS',
      'COMPRAS:MODIFICACION',
      'COMPRAS:APROBACION',
      'COMPRAS:LECTURA',
    ];

    /**
     * Insumo `SERIE` preparado por SQL directo: su ABM HTTP está detrás de
     * `AdminClienteGuard` y el cambio de seguimiento es de otro work unit. La
     * unidad de medida se marca `entera` con la misma vía.
     */
    async function crearInsumoSerie(): Promise<string> {
      const unidad = await tenantClient.unidadMedida.create({
        data: { codigo: `UE-${randomBytes(4).toString('hex')}`, nombre: 'Pieza E2E' },
      });
      await tenantClient.$executeRawUnsafe(
        `UPDATE unidades_medida SET entera = true WHERE id = '${unidad.id}'::uuid`,
      );
      const insumo = await tenantClient.insumo.create({
        data: {
          codigo: `SER-E2E-${randomBytes(4).toString('hex').toUpperCase()}`,
          nombre: 'Disco SSD E2E',
          familiaId: familiaInsumoId,
          unidadMedidaId: unidad.id,
          activo: true,
        },
      });
      await tenantClient.$executeRawUnsafe(
        `UPDATE insumos SET seguimiento = 'SERIE' WHERE id = '${insumo.id}'::uuid`,
      );
      return insumo.id;
    }

    async function unidadesDe(
      insumoId: string,
    ): Promise<{ numeroSerie: string | null; estado: string; condicion: string }[]> {
      const filas = await tenantClient.unidadInsumo.findMany({
        where: { insumoId },
        orderBy: { createdAt: 'asc' },
      });
      return filas.map((f) => ({
        numeroSerie: f.numeroSerie,
        estado: f.estado,
        condicion: f.condicion,
      }));
    }

    async function recibir(
      token: string,
      compraId: string,
      itemId: string,
      body: Record<string, unknown>,
    ) {
      return httpPost<ItemCompraResponseDto>(
        `${baseUrl}/compras/${compraId}/items/${itemId}/registrar-recepcion`,
        body,
        bearer(token),
      );
    }

    async function recibidaEnBase(token: string, compraId: string): Promise<number> {
      const detalle = await httpGet<CompraDetalleResponseDto>(
        `${baseUrl}/compras/${compraId}`,
        bearer(token),
      );
      return detalle.data.items[0].cantidadRecibida;
    }

    it('con todos los seriales crea una unidad NUEVA por pieza, con su serial', async () => {
      const actor = await crearActorConPermisos(PERMISOS);
      const insumoId = await crearInsumoSerie();
      const { compraId, itemId } = await compraConItemListoParaRecibir(actor.accessToken, 3, {
        insumoId,
      });

      const res = await recibir(actor.accessToken, compraId, itemId, {
        cantidadRecibida: 3,
        seriales: [' SN-1 ', 'SN-2', 'SN-3'],
      });

      expect(res.status).toBe(200);
      expect(await unidadesDe(insumoId)).toEqual([
        { numeroSerie: 'SN-1', estado: 'EN_DEPOSITO', condicion: 'NUEVO' },
        { numeroSerie: 'SN-2', estado: 'EN_DEPOSITO', condicion: 'NUEVO' },
        { numeroSerie: 'SN-3', estado: 'EN_DEPOSITO', condicion: 'NUEVO' },
      ]);
      expect(await movimientosDe(insumoId)).toHaveLength(3);
    });

    it('con seriales parciales completa con unidades de serie pendiente y la recepción queda completa', async () => {
      const actor = await crearActorConPermisos(PERMISOS);
      const insumoId = await crearInsumoSerie();
      const { compraId, itemId } = await compraConItemListoParaRecibir(actor.accessToken, 3, {
        insumoId,
      });

      const res = await recibir(actor.accessToken, compraId, itemId, {
        cantidadRecibida: 3,
        seriales: ['SN-1'],
      });

      expect(res.status).toBe(200);
      expect(res.data.cantidadRecibida).toBe(3);
      const unidades = await unidadesDe(insumoId);
      expect(unidades.map((u) => u.numeroSerie).filter((n) => n !== null)).toEqual(['SN-1']);
      expect(unidades).toHaveLength(3);
    });

    it('sin seriales crea todas las unidades con serie pendiente', async () => {
      const actor = await crearActorConPermisos(PERMISOS);
      const insumoId = await crearInsumoSerie();
      const { compraId, itemId } = await compraConItemListoParaRecibir(actor.accessToken, 2, {
        insumoId,
      });

      const res = await recibir(actor.accessToken, compraId, itemId, { cantidadRecibida: 2 });

      expect(res.status).toBe(200);
      expect((await unidadesDe(insumoId)).map((u) => u.numeroSerie)).toEqual([null, null]);
    });

    it('la recepción parcial acumulada crea solo las piezas de cada delta', async () => {
      const actor = await crearActorConPermisos(PERMISOS);
      const insumoId = await crearInsumoSerie();
      const { compraId, itemId } = await compraConItemListoParaRecibir(actor.accessToken, 5, {
        insumoId,
      });

      expect(
        (
          await recibir(actor.accessToken, compraId, itemId, {
            cantidadRecibida: 2,
            seriales: ['A-1', 'A-2'],
          })
        ).status,
      ).toBe(200);
      expect(
        (
          await recibir(actor.accessToken, compraId, itemId, {
            cantidadRecibida: 5,
            seriales: ['B-1'],
          })
        ).status,
      ).toBe(200);

      const unidades = await unidadesDe(insumoId);
      expect(unidades).toHaveLength(5);
      expect(unidades.map((u) => u.numeroSerie).filter((n) => n !== null)).toEqual([
        'A-1',
        'A-2',
        'B-1',
      ]);
    });

    it('reenviar el mismo acumulado (delta cero) no crea nada', async () => {
      const actor = await crearActorConPermisos(PERMISOS);
      const insumoId = await crearInsumoSerie();
      const { compraId, itemId } = await compraConItemListoParaRecibir(actor.accessToken, 3, {
        insumoId,
      });
      await recibir(actor.accessToken, compraId, itemId, {
        cantidadRecibida: 2,
        seriales: ['Z-1', 'Z-2'],
      });

      const otra = await recibir(actor.accessToken, compraId, itemId, {
        cantidadRecibida: 2,
        seriales: ['Z-9'],
      });

      expect(otra.status).toBe(200);
      expect(await unidadesDe(insumoId)).toHaveLength(2);
      expect(await movimientosDe(insumoId)).toHaveLength(2);
    });

    it('un serial repetido da 409 y revierte TODA la recepción (ni acumulado, ni unidades)', async () => {
      const actor = await crearActorConPermisos(PERMISOS);
      const insumoId = await crearInsumoSerie();
      const { compraId, itemId } = await compraConItemListoParaRecibir(actor.accessToken, 4, {
        insumoId,
      });
      await recibir(actor.accessToken, compraId, itemId, {
        cantidadRecibida: 1,
        seriales: ['DUP-1'],
      });

      const repetido = await recibir(actor.accessToken, compraId, itemId, {
        cantidadRecibida: 3,
        seriales: ['dup-1', 'NUEVO-2'],
      });

      expect(repetido.status).toBe(409);
      expect(await recibidaEnBase(actor.accessToken, compraId)).toBe(1);
      expect(await unidadesDe(insumoId)).toHaveLength(1);
      expect(await movimientosDe(insumoId)).toHaveLength(1);
    });

    it('una cantidad fraccional da 422 y rechaza toda la recepción', async () => {
      const actor = await crearActorConPermisos(PERMISOS);
      const insumoId = await crearInsumoSerie();
      const { compraId, itemId } = await compraConItemListoParaRecibir(actor.accessToken, 4, {
        insumoId,
      });

      const res = await recibir(actor.accessToken, compraId, itemId, { cantidadRecibida: 2.5 });

      expect(res.status).toBe(422);
      expect(await recibidaEnBase(actor.accessToken, compraId)).toBe(0);
      expect(await unidadesDe(insumoId)).toEqual([]);
    });

    it('más seriales que el delta da 422 y no crea nada', async () => {
      const actor = await crearActorConPermisos(PERMISOS);
      const insumoId = await crearInsumoSerie();
      const { compraId, itemId } = await compraConItemListoParaRecibir(actor.accessToken, 4, {
        insumoId,
      });

      const res = await recibir(actor.accessToken, compraId, itemId, {
        cantidadRecibida: 1,
        seriales: ['S-1', 'S-2'],
      });

      expect(res.status).toBe(422);
      expect(await recibidaEnBase(actor.accessToken, compraId)).toBe(0);
      expect(await unidadesDe(insumoId)).toEqual([]);
    });

    it('un serial fuera de 1 a 255 lo rechaza el borde con 400', async () => {
      const actor = await crearActorConPermisos(PERMISOS);
      const insumoId = await crearInsumoSerie();
      const { compraId, itemId } = await compraConItemListoParaRecibir(actor.accessToken, 2, {
        insumoId,
      });

      const res = await recibir(actor.accessToken, compraId, itemId, {
        cantidadRecibida: 1,
        seriales: ['A'.repeat(256)],
      });

      expect(res.status).toBe(400);
    });

    it('seriales sobre un insumo sin seguimiento dan 422 y la recepción no se asienta', async () => {
      const actor = await crearActorConPermisos(PERMISOS);
      const insumoId = await crearInsumoEnCatalogo();
      const { compraId, itemId } = await compraConItemListoParaRecibir(actor.accessToken, 2, {
        insumoId,
      });

      const res = await recibir(actor.accessToken, compraId, itemId, {
        cantidadRecibida: 1,
        seriales: ['X-1'],
      });

      expect(res.status).toBe(422);
      expect(await recibidaEnBase(actor.accessToken, compraId)).toBe(0);
    });
  });

  it('sanity: DATABASE_URL_MASTER apunta a una DB *_test y el tenant es efímero *_test', () => {
    expect(MASTER_TEST_URL).toMatch(/_test$/);
    expect(TENANT_DB_NAME).toMatch(/^soporte_prov_comprasE2E_.*_test$/);
  });
});
