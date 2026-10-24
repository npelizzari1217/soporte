/**
 * autorizacion.e2e.spec.ts — WU-7.7 (sdd/matriz-permisos-por-usuario). Cierra
 * el hueco que NINGÚN otro nivel puede ver (design §5, precedente
 * `compras.e2e.spec.ts`): un unit test del guard prueba que el guard
 * funciona, NO que el decorador esté puesto en la ruta correcta. Este cambio
 * agregó gate a CUATRO controllers que hoy NO tenían ninguno (TicketsController,
 * AdjuntosController, KbController, DashboardController, G2 del design) — un
 * `@RequiereAcciones` olvidado en un endpoint deja esa ruta abierta a
 * cualquier autenticado y todos los unit tests siguen en verde, porque nadie
 * los está mirando desde afuera.
 *
 * Las 4 escrituras de la Ayuda salieron de `TABLA_RUTAS` y viven en
 * `TABLA_RUTAS_ROOT`: al pasar los artículos a ser únicos y globales (master),
 * escribirlos quedó reservado a ROOT (`GlobalAdminGuard`) y la celda `KB:*` de
 * escritura dejó de abrir nada. El criterio de prueba cambia con eso — el test
 * que lo demuestra siembra esa celda y espera 403 IGUAL.
 *
 * Las rutas de tickets salieron de `TABLA_RUTAS` y viven en
 * `TABLA_RUTAS_TICKETS` (odd/permisos-por-tipo-ticket, T5b, D5 d): ya no las
 * decide una celda `TICKETS:*` en `AccionesGuard`, sino el caso de uso con los
 * permisos por tipo del actor. El criterio de prueba cambia con eso, y cada
 * ruta se prueba de los dos lados con asserts de contenido: sin filas por tipo
 * (con la celda vieja o sin ella) el caso de uso no deja ver ni escribir nada;
 * con la acción por tipo y SIN ninguna celda `TICKETS:*`, la operación ocurre.
 *
 * Paths LITERALES hardcodeados en `TABLA_RUTAS`, NUNCA importados de los
 * controllers (mismo criterio que `compras.e2e.spec.ts`: si se importaran del
 * mismo lugar que los define, un rename movería el test junto con el código y
 * dejaría de atrapar nada).
 *
 * Cubre además R11 (`sdd/matriz-permisos-por-usuario/spec-r11`, S28-S33): el
 * scope de FILAS/CAMPOS de `VER_TODOS`/`OBSERVAR` no se puede probar con solo
 * el código de estado — dos actores distintos pueden recibir 200 con
 * subconjuntos de contenido completamente distintos si la migración salió
 * mal. Solo un assert de CONTENIDO lo atrapa (nota del orquestador para esta
 * tanda: "la tabla de códigos de estado no alcanza para estas 5 rutas").
 *
 * Regla anti verde vacuo (aplicada en TODOS los asserts de subconjunto de
 * esta suite): el fixture SIEMPRE contiene el elemento que NO debe aparecer,
 * y existe el caso hermano con el permiso presente — un assert de ausencia
 * sobre un fixture vacío pasaría en verde sin probar nada.
 *
 * Harness: `AuthModule` + `TicketsModule` (incl. `AdjuntosController`,
 * `CatalogosController`) + `KbModule` + `DashboardModule`, una sola DB tenant
 * efímera sembrada con `TenantSeederAdapter.seed()` — mismo patrón que
 * `tickets.e2e.spec.ts`/`compras.e2e.spec.ts` (fetch nativo, sin supertest,
 * `app.close()` ANTES de `dropDatabase`, truncate de master en `beforeEach`).
 *
 * Ref design: design-parte2 §5 ("dónde es OBLIGATORIO"), G2. Ref spec-r11:
 * S28-S33.
 */
import { randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  INestApplication,
  MiddlewareConsumer,
  Module,
  NestModule,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { SharedModule } from '../../../shared/shared.module';
import { AuthModule } from '../../auth.module';
import { TicketsModule } from '../../../tickets/tickets.module';
import { KbModule } from '../../../kb/kb.module';
import { DashboardModule } from '../../../dashboard/dashboard.module';
import { ClientesModule } from '../../../clientes/clientes.module';
import { TenantScopeMiddleware } from '../../../shared/tenancy/tenant-scope.middleware';

import { PrismaService } from '../../../shared/infrastructure/persistence/prisma.service';
import {
  MasterPrismaClient,
  TenantPrismaClient,
} from '../../../shared/infrastructure/persistence/prisma-clients';
import { PostgresAdminService } from '../../../clientes/infrastructure/postgres-admin.service';
import { TenantMigrationRunnerAdapter } from '../../../clientes/infrastructure/tenant-migration-runner.adapter';
import { TenantSeederAdapter } from '../../../clientes/infrastructure/tenant-seeder.adapter';
import { PrismaClienteRepository } from '../../../clientes/infrastructure/persistence/prisma/prisma-cliente.repository';
import { PrismaUsuarioRepository } from '../../infrastructure/persistence/prisma/prisma-usuario.repository';
import { PrismaMatrizPermisosRepository } from '../../infrastructure/persistence/prisma/prisma-matriz-permisos.repository';
import { CodigoAccion } from '../../../shared/domain/acciones';
import { activarTfaDeTest, codigoDeTest } from '../../test-helpers/tfa-de-test';
import { ClienteEntity } from '../../../clientes/domain/entities/cliente.entity';
import { UsuarioEntity } from '../../domain/entities/usuario.entity';
import { RoleEntity } from '../../domain/entities/role.entity';
import { Argon2HashProvider } from '../../infrastructure/argon2-hash.provider';
import type {
  TicketResponseDto,
  OperacionResponseDto,
} from '../../../tickets/interface/dtos/ticket.dto';
import type { KbArticuloResponseDto } from '../../../kb/interface/dtos/kb-articulo.dto';
import { usarLockMasterTest } from '../../../testing/lock-master-test';
import {
  celdasDeLaMatriz,
  sembrarPermisosPorTipoE2e,
} from '../../../tickets/test-helpers/permisos-por-tipo-e2e';
import { AccionTipoTicket } from '../../../tickets/domain/permisos-tipo-ticket';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const TENANT_DB_NAME = `soporte_prov_autorizE2E_${randomBytes(4).toString('hex')}_test`;
const PLAINTEXT_PASSWORD = 'E2eAutorizSecret!123';

// ─── Helpers HTTP (fetch nativo, mismo patrón que auth.e2e.spec.ts/compras.e2e.spec.ts) ──

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

async function httpConCuerpo<T = unknown>(
  method: 'PATCH' | 'PUT',
  url: string,
  body: unknown,
  headers: Headers = {},
): Promise<{ status: number; data: T }> {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as T;
  return { status: res.status, data };
}

async function httpPatch<T = unknown>(
  url: string,
  body: unknown,
  headers: Headers = {},
): Promise<{ status: number; data: T }> {
  return httpConCuerpo<T>('PATCH', url, body, headers);
}

async function httpPut<T = unknown>(
  url: string,
  body: unknown,
  headers: Headers = {},
): Promise<{ status: number; data: T }> {
  return httpConCuerpo<T>('PUT', url, body, headers);
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

/** POST multipart/form-data con un único archivo en el campo `archivo` (rutas de adjuntos). */
async function httpPostMultipart<T = unknown>(
  url: string,
  headers: Headers = {},
): Promise<{ status: number; data: T }> {
  const form = new FormData();
  form.append(
    'archivo',
    new Blob([Uint8Array.from(Buffer.from('adjunto-e2e-por-tipo'))], { type: 'image/png' }),
    'evidencia.png',
  );
  const res = await fetch(url, { method: 'POST', headers, body: form });
  const data = (await res.json().catch(() => null)) as T;
  return { status: res.status, data };
}

function bearer(token: string): Headers {
  return { Authorization: `Bearer ${token}` };
}

@Module({
  imports: [SharedModule, AuthModule, TicketsModule, KbModule, DashboardModule, ClientesModule],
})
class TestHarnessModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantScopeMiddleware).forRoutes('*');
  }
}

const ID = '00000000-0000-4000-8000-000000000001';

type Metodo = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

/**
 * WU-7.7 — rutas de los CUATRO controllers que antes de este cambio no
 * tenían NINGÚN gate (G2, el riesgo más alto del design). `:id` es un UUID
 * sintético inexistente: no importa su existencia real porque `AccionesGuard`
 * corta ANTES de que el controller toque la DB de negocio — alcanza con que
 * el ROUTING matchee el path+método (mismo criterio que `compras.e2e.spec.ts`).
 */
interface RutaEsperada {
  metodo: Metodo;
  path: string;
  acciones: CodigoAccion[];
}

const TABLA_RUTAS: RutaEsperada[] = [
  // Las 11 rutas de tickets y adjuntos ya NO están acá: las decide el caso de uso con los
  // permisos por tipo, no `AccionesGuard`. Viven en `TABLA_RUTAS_TICKETS`.
  // Las 4 escrituras de KB ya NO están acá: la Ayuda es única y global, y
  // escribirla pasó a ser exclusivo de ROOT. Viven en `TABLA_RUTAS_ROOT`.
  { metodo: 'GET', path: '/kb', acciones: ['KB:LECTURA'] },
  { metodo: 'GET', path: `/kb/${ID}`, acciones: ['KB:LECTURA'] },
  { metodo: 'GET', path: '/dashboard/metricas', acciones: ['DASHBOARD:LECTURA'] },
];

/** Ids del ticket del fixture y de su operación de apertura, para armar el path. */
interface IdsFixture {
  ticketId: string;
  operacionId: string;
}

/**
 * Una ruta de tickets (odd/permisos-por-tipo-ticket, T5b, D5 d): ya no la decide una celda en
 * `AccionesGuard`, sino el caso de uso con los permisos por tipo.
 *
 * - `celdaVieja`: la celda de módulo que la ruta exigía hasta T5a; solo nombra el caso. Desde T9b
 *   ya no se puede guardar en la matriz (el CHECK la rechaza), así que no se siembra.
 * - `acciones`: las acciones por tipo que la operación exige sobre el tipo del ticket, además
 *   de `LECTURA` y `VER_TODOS` (las que dejan ver un ticket ajeno).
 * - `sinFilas`: lo que responde el caso de uso a un actor sin filas por tipo.
 * - `efecto`: el assert de contenido del lado positivo, contra la respuesta y la base.
 */
interface RutaTicketPorTipo {
  metodo: Metodo;
  path: (ids: IdsFixture) => string;
  celdaVieja: string;
  acciones: AccionTipoTicket[];
  cuerpo?: (ctx: ContextoCuerpo) => unknown;
  multipart?: true;
  sinFilas: 404 | 403 | 'LISTA_VACIA';
  status: 200 | 201;
  efecto: (
    data: unknown,
    ids: IdsFixture,
    tenant: InstanceType<typeof TenantPrismaClient>,
    asignableId: string,
  ) => Promise<void>;
}

/** Lo que el cuerpo de una ruta puede necesitar del fixture. */
interface ContextoCuerpo {
  asignableId: string;
  tipoId: string;
  prioridadId: string;
}

/** Los `id` de una lista JSON de objetos, o falla el test si no lo es. */
function idsDe(lista: unknown): string[] {
  if (!Array.isArray(lista)) throw new Error(`No es una lista: ${JSON.stringify(lista)}`);
  return lista.map(idDe);
}

/** Los `id` de los `items` de una página JSON, o falla el test si no la es. */
function idsDeItems(pagina: unknown): string[] {
  if (typeof pagina !== 'object' || pagina === null || !('items' in pagina)) {
    throw new Error(`No es una página: ${JSON.stringify(pagina)}`);
  }
  return idsDe(pagina.items);
}

/** Código del estado actual del ticket, leído de la base. */
async function codigoEstado(
  tenant: InstanceType<typeof TenantPrismaClient>,
  ticketId: string,
): Promise<string> {
  const ticket = await tenant.ticket.findUniqueOrThrow({
    where: { id: ticketId },
    select: { estado: { select: { codigo: true } } },
  });
  return ticket.estado.codigo;
}

/** `id` de una respuesta JSON, o falla el test si no lo trae. */
function idDe(data: unknown): string {
  if (typeof data === 'object' && data !== null && 'id' in data && typeof data.id === 'string') {
    return data.id;
  }
  throw new Error(`La respuesta no trae un id: ${JSON.stringify(data)}`);
}

const TABLA_RUTAS_TICKETS: RutaTicketPorTipo[] = [
  {
    metodo: 'GET',
    path: () => '/tickets',
    celdaVieja: 'TICKETS:LECTURA',
    acciones: [],
    sinFilas: 'LISTA_VACIA',
    status: 200,
    efecto: async (data, ids) => {
      expect(idsDeItems(data)).toContain(ids.ticketId);
    },
  },
  {
    metodo: 'GET',
    path: ({ ticketId }) => `/tickets/${ticketId}`,
    celdaVieja: 'TICKETS:LECTURA',
    acciones: [],
    sinFilas: 404,
    status: 200,
    efecto: async (data, ids) => {
      expect(idDe(data)).toBe(ids.ticketId);
    },
  },
  {
    metodo: 'GET',
    path: ({ ticketId }) => `/tickets/${ticketId}/timeline`,
    celdaVieja: 'TICKETS:LECTURA',
    acciones: [],
    sinFilas: 404,
    status: 200,
    efecto: async (data, ids) => {
      expect(idsDe(data)).toContain(ids.operacionId);
    },
  },
  {
    metodo: 'POST',
    path: () => '/tickets',
    celdaVieja: 'TICKETS:ALTAS',
    acciones: ['ALTAS'],
    cuerpo: ({ tipoId, prioridadId }) => ({ titulo: 'Alta por tipo E2E', tipoId, prioridadId }),
    sinFilas: 403,
    status: 201,
    efecto: async (data, _ids, tenant) => {
      const creado = await tenant.ticket.findUnique({ where: { id: idDe(data) } });
      expect(creado?.titulo).toBe('Alta por tipo E2E');
    },
  },
  {
    metodo: 'PATCH',
    path: ({ ticketId }) => `/tickets/${ticketId}`,
    celdaVieja: 'TICKETS:MODIFICACION',
    acciones: ['MODIFICACION'],
    cuerpo: () => ({ titulo: 'Editado por tipo E2E' }),
    sinFilas: 404,
    status: 200,
    efecto: async (_data, ids, tenant) => {
      const ticket = await tenant.ticket.findUniqueOrThrow({ where: { id: ids.ticketId } });
      expect(ticket.titulo).toBe('Editado por tipo E2E');
    },
  },
  {
    metodo: 'PATCH',
    path: ({ ticketId }) => `/tickets/${ticketId}/estado`,
    celdaVieja: 'TICKETS:TRANSICIONAR',
    acciones: ['TRANSICIONAR'],
    cuerpo: () => ({ nuevoEstadoCodigo: 'ASIGNADO' }),
    sinFilas: 404,
    status: 200,
    efecto: async (_data, ids, tenant) => {
      expect(await codigoEstado(tenant, ids.ticketId)).toBe('ASIGNADO');
    },
  },
  {
    metodo: 'PATCH',
    path: ({ ticketId }) => `/tickets/${ticketId}/asignar`,
    celdaVieja: 'TICKETS:ASIGNAR',
    acciones: ['ASIGNAR'],
    cuerpo: ({ asignableId }) => ({ asignadoId: asignableId }),
    sinFilas: 404,
    status: 200,
    efecto: async (_data, ids, tenant, asignableId) => {
      const ticket = await tenant.ticket.findUniqueOrThrow({ where: { id: ids.ticketId } });
      expect(ticket.asignadoId).toBe(asignableId);
    },
  },
  {
    metodo: 'PATCH',
    path: ({ ticketId }) => `/tickets/${ticketId}/asignar-en-proceso`,
    celdaVieja: 'TICKETS:ASIGNAR',
    acciones: ['ASIGNAR', 'TRANSICIONAR'],
    cuerpo: ({ asignableId }) => ({ asignadoId: asignableId }),
    sinFilas: 404,
    status: 200,
    efecto: async (_data, ids, tenant, asignableId) => {
      const ticket = await tenant.ticket.findUniqueOrThrow({ where: { id: ids.ticketId } });
      expect(ticket.asignadoId).toBe(asignableId);
      expect(await codigoEstado(tenant, ids.ticketId)).toBe('EN_PROCESO');
    },
  },
  {
    metodo: 'POST',
    path: ({ ticketId }) => `/tickets/${ticketId}/comentarios`,
    celdaVieja: 'TICKETS:COMENTAR',
    acciones: ['COMENTAR'],
    cuerpo: () => ({ texto: 'Comentario por tipo E2E' }),
    sinFilas: 404,
    status: 201,
    efecto: async (_data, ids, tenant) => {
      const comentarios = await tenant.operacionTicket.count({
        where: { ticketId: ids.ticketId, descripcion: 'Comentario por tipo E2E' },
      });
      expect(comentarios).toBe(1);
    },
  },
  {
    metodo: 'POST',
    path: ({ ticketId }) => `/tickets/${ticketId}/adjuntos`,
    celdaVieja: 'TICKETS:ALTAS',
    acciones: ['ALTAS'],
    multipart: true,
    sinFilas: 404,
    status: 201,
    efecto: async (data, ids, tenant) => {
      const join = await tenant.archivoTicket.findUnique({
        where: { archivoId_ticketId: { archivoId: idDe(data), ticketId: ids.ticketId } },
      });
      expect(join).not.toBeNull();
    },
  },
  {
    metodo: 'POST',
    path: ({ operacionId }) => `/operaciones/${operacionId}/adjuntos`,
    celdaVieja: 'TICKETS:ALTAS',
    acciones: ['ALTAS'],
    multipart: true,
    sinFilas: 404,
    status: 201,
    efecto: async (data, ids, tenant) => {
      const join = await tenant.archivoOperacion.findUnique({
        where: {
          archivoId_operacionId: { archivoId: idDe(data), operacionId: ids.operacionId },
        },
      });
      expect(join).not.toBeNull();
    },
  },
];

/**
 * C4 (fix post-verify) — las 16 rutas gateadas por `AdminClienteGuard` (S9:
 * catálogos, S10: ciclos-vigentes) que NINGÚN test probaba a nivel de
 * APLICACIÓN: un unit test del guard prueba que el guard funciona, NO que el
 * decorador esté puesto en la ruta correcta (design-parte2 §5, mismo criterio
 * que `TABLA_RUTAS`). Antes de este fix, borrar cualquiera de los 16
 * `@UseGuards(AdminClienteGuard)` dejaba la suite entera en verde.
 *
 * `POST /usuarios` queda afuera: ya tiene cobertura dedicada más arriba
 * (`'POST /usuarios con el mismo token de TECNICO → 403'`).
 */
interface RutaAdminEsperada {
  metodo: Metodo;
  path: string;
}

/**
 * Las 4 escrituras de la Ayuda, reservadas a ROOT (`GlobalAdminGuard` por
 * método en `KbController`). Los artículos son únicos y globales: un
 * administrador de cliente que los editara estaría cambiando lo que leen los
 * demás clientes.
 *
 * Se prueban aparte de `TABLA_RUTAS` porque el criterio de apertura es otro:
 * acá la celda `KB:*` de escritura NO abre nada, y el test que lo demuestra
 * siembra justamente esa celda y espera 403 igual.
 */
const TABLA_RUTAS_ROOT: RutaEsperada[] = [
  { metodo: 'POST', path: '/kb', acciones: ['KB:ALTAS'] },
  { metodo: 'PATCH', path: `/kb/${ID}`, acciones: ['KB:MODIFICACION'] },
  { metodo: 'PATCH', path: `/kb/${ID}/visibilidad`, acciones: ['KB:PUBLICAR'] },
  { metodo: 'DELETE', path: `/kb/${ID}`, acciones: ['KB:BORRADO'] },
];

const TABLA_RUTAS_ADMIN: RutaAdminEsperada[] = [
  // catálogos (S9) — 6
  { metodo: 'POST', path: '/catalogos/tipos-ticket' },
  { metodo: 'PATCH', path: `/catalogos/tipos-ticket/${ID}` },
  { metodo: 'PATCH', path: `/catalogos/tipos-ticket/${ID}/estado` },
  { metodo: 'POST', path: '/catalogos/prioridades' },
  { metodo: 'PATCH', path: `/catalogos/prioridades/${ID}` },
  { metodo: 'PATCH', path: `/catalogos/prioridades/${ID}/estado` },
  // ciclos — 3
  { metodo: 'POST', path: '/ciclos' },
  { metodo: 'PATCH', path: `/ciclos/${ID}/activar` },
  { metodo: 'PATCH', path: `/ciclos/${ID}/desactivar` },
  // ciclos-vigentes (S10) — 1
  { metodo: 'GET', path: '/ciclos-vigentes' },
  // usuarios — 6 (POST /usuarios ya cubierto arriba)
  { metodo: 'PATCH', path: `/usuarios/${ID}/rol` },
  { metodo: 'PATCH', path: `/usuarios/${ID}` },
  { metodo: 'DELETE', path: `/usuarios/${ID}/membresia` },
  { metodo: 'GET', path: `/usuarios/${ID}/permisos` },
  { metodo: 'PATCH', path: `/usuarios/${ID}/permisos` },
  { metodo: 'POST', path: `/usuarios/${ID}/permisos/aplicar-preset` },
  // permisos por tipo de ticket (odd/permisos-por-tipo-ticket, T7) — 3
  { metodo: 'GET', path: `/usuarios/${ID}/permisos-por-tipo` },
  { metodo: 'PUT', path: `/usuarios/${ID}/permisos-por-tipo` },
  { metodo: 'POST', path: `/usuarios/${ID}/permisos-por-tipo/copiar-de/${ID}` },
];

// Turno exclusivo sobre la master de test compartida — ver src/testing/lock-master-test.ts.
usarLockMasterTest();

describe('Autorización e2e — TABLA_RUTAS (G2, WU-7.7) + scope de filas/campos (R11, S28-S33)', () => {
  let app: INestApplication;
  let baseUrl: string;

  let prismaService: PrismaService;
  let emailKeyOriginal: string | undefined;
  let storageDirOriginal: string | undefined;
  let storageDir: string;
  let masterClient: InstanceType<typeof MasterPrismaClient>;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;
  let clienteRepo: PrismaClienteRepository;
  let usuarioRepo: PrismaUsuarioRepository;
  let permisosRepo: PrismaMatrizPermisosRepository;
  let hashProvider: Argon2HashProvider;

  const admin = new PostgresAdminService(MASTER_TEST_URL);

  let tipoSoporteId: string;
  let prioridadMediaId: string;
  let cicloActivoId: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL_MASTER) {
      process.env.DATABASE_URL_MASTER = MASTER_TEST_URL;
    }
    emailKeyOriginal = process.env.EMAIL_CRYPTO_KEY;
    process.env.EMAIL_CRYPTO_KEY = 'f'.repeat(64);
    // Los adjuntos de `TABLA_RUTAS_TICKETS` escriben el binario a disco: un directorio temporal
    // propio, que `SharedModule` lee al instanciar el storage (mismo criterio que tickets.e2e).
    storageDirOriginal = process.env.STORAGE_DIR;
    storageDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'soporte-autoriz-e2e-storage-'));
    process.env.STORAGE_DIR = storageDir;

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

    const tipoSoporte = await tenantClient.tipoTicket.findUniqueOrThrow({
      where: { codigo: 'SOPORTE' },
    });
    tipoSoporteId = tipoSoporte.id;
    const prioridadMedia = await tenantClient.prioridad.findUniqueOrThrow({
      where: { codigo: 'MEDIA' },
    });
    prioridadMediaId = prioridadMedia.id;

    const cicloActivo = await tenantClient.cicloCliente.create({
      data: {
        cicloVigenteId: '01900000-0000-7000-8000-000000000002',
        nombre: 'E2E Autorización Ciclo Activo',
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
    if (emailKeyOriginal === undefined) delete process.env.EMAIL_CRYPTO_KEY;
    else process.env.EMAIL_CRYPTO_KEY = emailKeyOriginal;
    if (storageDirOriginal === undefined) delete process.env.STORAGE_DIR;
    else process.env.STORAGE_DIR = storageDirOriginal;
    if (storageDir) await fs.promises.rm(storageDir, { recursive: true, force: true });
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
    // usuario_cliente_permisos NO tiene FK declarada — el TRUNCATE CASCADE de
    // las tablas viejas no la alcanza (mismo gotcha de auth.e2e.spec.ts/
    // compras.e2e.spec.ts). roles_permisos/permisos ya NO existen (migración
    // drop_legacy_rbac_tablas_muertas, converge con WU-9 en producción).
    // `kb_articulos` entra a la lista porque la Ayuda pasó a vivir en master:
    // es una tabla GLOBAL, compartida por toda la suite. Sin este truncate, los
    // artículos de un test se cuelan en el conteo del siguiente y los asserts
    // de subconjunto de S30 dejan de ser deterministas.
    await masterClient.$executeRawUnsafe(
      'TRUNCATE TABLE membresias, refresh_tokens, usuario_cliente_permisos, usuarios, clientes, roles, kb_articulos RESTART IDENTITY CASCADE',
    );
  });

  // ─── Fixtures ─────────────────────────────────────────────────────────

  async function crearClienteTenant(): Promise<ClienteEntity> {
    const cliente = ClienteEntity.create({
      nombre: `E2E Autoriz ${randomBytes(3).toString('hex')}`,
      razonSocial: null,
      cuit: null,
      dbName: TENANT_DB_NAME,
      activo: true,
    });
    await clienteRepo.save(cliente);
    return cliente;
  }

  /** `codigo` fijo permite armar un actor ADMINISTRADOR (`esAdminDeCliente` lee `rol === 'ADMINISTRADOR'` del JWT, que sale de `role.codigo`, C4). */
  async function crearRoleVacio(codigo?: string): Promise<RoleEntity> {
    const role = RoleEntity.create({
      codigo: codigo ?? `ROL_E2E_${randomBytes(3).toString('hex')}`,
      nombre: 'Rol E2E',
      descripcion: null,
      permisos: [],
    });
    await masterClient.role.create({
      data: { id: role.id, codigo: role.codigo, nombre: role.nombre },
    });
    return role;
  }

  async function crearUsuario(isGlobalAdmin = false): Promise<UsuarioEntity> {
    const usuario = UsuarioEntity.create({
      email: `e2e_autoriz_${randomBytes(4).toString('hex')}@test.local`,
      nombre: 'E2E',
      apellido: 'Autoriz',
      passwordHash: await hashProvider.hash(PLAINTEXT_PASSWORD),
      activo: true,
      isGlobalAdmin,
    });
    await usuarioRepo.save(usuario);
    // L3: el ROOT esta obligado; entra con un secreto de prueba conocido, nunca por un bypass.
    if (isGlobalAdmin) await activarTfaDeTest(prismaService, usuario.id);
    return usuario;
  }

  async function login(email: string): Promise<{ accessToken: string }> {
    const paso1 = await httpPost<{ accessToken: string; needs2fa?: true; desafio?: string }>(
      `${baseUrl}/auth/login`,
      { email, password: PLAINTEXT_PASSWORD },
    );
    if (!paso1.data.needs2fa) return paso1.data;
    const usuario = await usuarioRepo.findByEmail(email);
    const { data: v } = await httpPost<{ ticket: string }>(`${baseUrl}/auth/2fa/verificar`, {
      desafio: paso1.data.desafio,
      codigo: codigoDeTest(usuario!.id),
    });
    const { data } = await httpPost<{ accessToken: string }>(`${baseUrl}/auth/login/continuar`, {
      ticket: v.ticket,
    });
    return data;
  }

  /**
   * Actor NUEVO, en un cliente NUEVO, con exactamente las celdas pedidas
   * sembradas directo en la matriz — mismo criterio que `compras.e2e.spec.ts`
   * (rol RBAC viejo vacío a propósito, `resolverScope` ya no lo lee).
   */
  async function crearActorConPermisos(
    permisos: string[],
  ): Promise<{ accessToken: string; clienteId: string; usuarioId: string }> {
    const cliente = await crearClienteTenant();
    const role = await crearRoleVacio();
    const usuario = await crearUsuario();
    await masterClient.membresia.create({
      data: { usuarioId: usuario.id, clienteId: cliente.id, rolId: role.id, activo: true },
    });
    await permisosRepo.setPermisos(usuario.id, cliente.id, celdasDeLaMatriz(permisos));
    // Las operaciones por id de un ticket deciden con los permisos por tipo del tenant: los mismos
    // que estas celdas, traducidos por L11 (odd/permisos-por-tipo-ticket, T5a). Las de tickets ya
    // no van a la matriz master (T9b).
    await sembrarPermisosPorTipoE2e(tenantClient, new Map([[usuario.id, permisos]]));
    const { accessToken } = await login(usuario.email);
    return { accessToken, clienteId: cliente.id, usuarioId: usuario.id };
  }

  /**
   * Actor NUEVO, en un cliente NUEVO, con rol `codigo='ADMINISTRADOR'` — es lo
   * que `AdminClienteGuard`/`esAdminDeCliente` lee (C4, S9/S10). Sin celdas en
   * la matriz a propósito: `AdminClienteGuard` no consulta la matriz, solo el
   * JWT.
   */
  async function crearActorAdministrador(): Promise<{
    accessToken: string;
    clienteId: string;
    usuarioId: string;
  }> {
    const cliente = await crearClienteTenant();
    const role = await crearRoleVacio('ADMINISTRADOR');
    const usuario = await crearUsuario();
    await masterClient.membresia.create({
      data: { usuarioId: usuario.id, clienteId: cliente.id, rolId: role.id, activo: true },
    });
    const { accessToken } = await login(usuario.email);
    return { accessToken, clienteId: cliente.id, usuarioId: usuario.id };
  }

  /**
   * Actor ROOT (`usuarios.is_global_admin = true`), en un cliente NUEVO y sin
   * ninguna celda en la matriz: `GlobalAdminGuard` solo mira el flag del JWT.
   * La membresía existe únicamente para que el login pueda emitir un token con
   * `cliente_id` — la Ayuda es global y no depende de ese cliente.
   */
  async function crearActorRoot(): Promise<{
    accessToken: string;
    clienteId: string;
    usuarioId: string;
  }> {
    const cliente = await crearClienteTenant();
    const role = await crearRoleVacio();
    const usuario = await crearUsuario(true);
    await masterClient.membresia.create({
      data: { usuarioId: usuario.id, clienteId: cliente.id, rolId: role.id, activo: true },
    });
    const { accessToken } = await login(usuario.email);
    return { accessToken, clienteId: cliente.id, usuarioId: usuario.id };
  }

  /** Un segundo (o tercer) actor en el MISMO cliente que uno ya creado (R11: scope de filas dentro de UN tenant). */
  async function agregarActorAlCliente(
    clienteId: string,
    permisos: string[],
  ): Promise<{ accessToken: string; usuarioId: string }> {
    const role = await crearRoleVacio();
    const usuario = await crearUsuario();
    await masterClient.membresia.create({
      data: { usuarioId: usuario.id, clienteId, rolId: role.id, activo: true },
    });
    await permisosRepo.setPermisos(usuario.id, clienteId, celdasDeLaMatriz(permisos));
    await sembrarPermisosPorTipoE2e(tenantClient, new Map([[usuario.id, permisos]]));
    const { accessToken } = await login(usuario.email);
    return { accessToken, usuarioId: usuario.id };
  }

  /**
   * Actor NUEVO en un cliente existente con celdas y filas por tipo independientes
   * (odd/permisos-por-tipo-ticket, T5b): `celdas` va a la matriz master, `filas` a la tabla del
   * tenant sobre el tipo SOPORTE. A diferencia de `agregarActorAlCliente`, las filas NO salen de
   * las celdas: así se prueban por separado.
   */
  async function crearActorPorTipo(
    clienteId: string,
    celdas: CodigoAccion[],
    filas: AccionTipoTicket[],
  ): Promise<{ accessToken: string; usuarioId: string }> {
    const role = await crearRoleVacio();
    const usuario = await crearUsuario();
    await masterClient.membresia.create({
      data: { usuarioId: usuario.id, clienteId, rolId: role.id, activo: true },
    });
    await permisosRepo.setPermisos(usuario.id, clienteId, celdas);
    if (filas.length > 0) {
      await tenantClient.permisoTipoTicket.createMany({
        data: filas.map((accion) => ({ usuarioId: usuario.id, tipoId: tipoSoporteId, accion })),
      });
    }
    const { accessToken } = await login(usuario.email);
    return { accessToken, usuarioId: usuario.id };
  }

  /**
   * Ticket SOPORTE de un ADMINISTRADOR (sin restricción por tipo), ajeno al actor que se prueba,
   * con su operación de apertura. El asignado elegible es un TECNICO del mismo cliente con
   * `LECTURA` sobre SOPORTE: un ADMINISTRADOR no recibe tickets.
   */
  async function fixtureTicketAjeno(): Promise<{
    ids: IdsFixture;
    clienteId: string;
    asignableId: string;
  }> {
    const duenio = await crearActorAdministrador();
    const ticket = await crearTicket(duenio.accessToken, { titulo: 'Ticket ajeno E2E' });
    const apertura = await tenantClient.operacionTicket.findFirstOrThrow({
      where: { ticketId: ticket.id },
    });
    const rolTecnico = await masterClient.role.upsert({
      where: { codigo: 'TECNICO' },
      create: { codigo: 'TECNICO', nombre: 'TECNICO' },
      update: {},
    });
    const tecnico = await crearUsuario();
    await masterClient.membresia.create({
      data: {
        usuarioId: tecnico.id,
        clienteId: duenio.clienteId,
        rolId: rolTecnico.id,
        activo: true,
      },
    });
    await tenantClient.permisoTipoTicket.create({
      data: { usuarioId: tecnico.id, tipoId: tipoSoporteId, accion: 'LECTURA' },
    });
    return {
      ids: { ticketId: ticket.id, operacionId: apertura.id },
      clienteId: duenio.clienteId,
      asignableId: tecnico.id,
    };
  }

  /** Lo que una escritura rechazada no puede haber cambiado. */
  async function fotoDelTicket(ids: IdsFixture): Promise<unknown> {
    const ticket = await tenantClient.ticket.findUniqueOrThrow({ where: { id: ids.ticketId } });
    return {
      ticket,
      operaciones: await tenantClient.operacionTicket.count({ where: { ticketId: ids.ticketId } }),
      adjuntosTicket: await tenantClient.archivoTicket.count({ where: { ticketId: ids.ticketId } }),
      adjuntosOperacion: await tenantClient.archivoOperacion.count({
        where: { operacionId: ids.operacionId },
      }),
      altas: await tenantClient.ticket.count({ where: { titulo: 'Alta por tipo E2E' } }),
    };
  }

  /** Llama la ruta de la tabla con su cuerpo (JSON o multipart). */
  async function llamarRutaTicket(
    ruta: RutaTicketPorTipo,
    ids: IdsFixture,
    asignableId: string,
    token: string,
  ): Promise<{ status: number; data: unknown }> {
    const url = `${baseUrl}${ruta.path(ids)}`;
    if (ruta.multipart) return httpPostMultipart(url, bearer(token));
    const cuerpo =
      ruta.cuerpo?.({ asignableId, tipoId: tipoSoporteId, prioridadId: prioridadMediaId }) ?? {};
    if (ruta.metodo === 'GET') return httpGet(url, bearer(token));
    if (ruta.metodo === 'PATCH') return httpPatch(url, cuerpo, bearer(token));
    return httpPost(url, cuerpo, bearer(token));
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
    if (metodo === 'PUT') return httpPut(url, {}, headers);
    return httpPost(url, {}, headers);
  }

  async function crearTicket(
    token: string,
    overrides: Record<string, unknown> = {},
  ): Promise<TicketResponseDto> {
    const { data } = await httpPost<TicketResponseDto>(
      `${baseUrl}/tickets`,
      { titulo: 'Ticket E2E', tipoId: tipoSoporteId, prioridadId: prioridadMediaId, ...overrides },
      bearer(token),
    );
    return data;
  }

  async function crearArticuloKb(
    token: string,
    overrides: Record<string, unknown> = {},
  ): Promise<KbArticuloResponseDto> {
    const { data } = await httpPost<KbArticuloResponseDto>(
      `${baseUrl}/kb`,
      { titulo: 'Artículo E2E', contenido: 'Contenido E2E', ...overrides },
      bearer(token),
    );
    return data;
  }

  async function publicarArticuloKb(token: string, id: string): Promise<void> {
    await httpPatch(`${baseUrl}/kb/${id}/visibilidad`, { visible: true }, bearer(token));
  }

  // ─── G2 — Existencia de las rutas nuevas (paths LITERALES) ──────────────

  describe('Existencia de las rutas de los 4 controllers antes sin gate (G2)', () => {
    it.each(TABLA_RUTAS)(
      '$metodo $path existe: sin Bearer → 401 (NUNCA 404 de routing — si el path fue renombrado, este assert falla)',
      async ({ metodo, path }) => {
        const { status } = await callMethod(metodo, path);
        expect(status).toBe(401);
      },
    );
  });

  // ─── G2 — Gate real: SIN la acción → 403 ─────────────────────────────────

  describe('AccionesGuard real por ruta: actor SIN ninguna celda → 403 (G2)', () => {
    it.each(TABLA_RUTAS)(
      '$metodo $path exige $acciones: actor con 0 celdas → 403',
      async ({ metodo, path }) => {
        const actor = await crearActorConPermisos([]);
        const { status } = await callMethod(metodo, path, actor.accessToken);
        expect(status).toBe(403);
      },
    );
  });

  // ─── G2 — Gate real: CON la acción exacta → NO 403 (el gate se abre) ─────

  describe('AccionesGuard real por ruta: actor CON la acción exacta → NO 403 (G2)', () => {
    it.each(TABLA_RUTAS)(
      '$metodo $path con $acciones sembradas → status distinto de 401/403 (el gate se abrió)',
      async ({ metodo, path, acciones }) => {
        const actor = await crearActorConPermisos(acciones);
        const { status } = await callMethod(metodo, path, actor.accessToken);
        expect(status).not.toBe(401);
        expect(status).not.toBe(403);
      },
    );
  });

  // ─── Rutas de tickets: deciden los permisos por tipo, no AccionesGuard (T5b, D5 d) ──

  describe('Rutas de tickets (odd/permisos-por-tipo-ticket, D5 d): existen y exigen sesión', () => {
    it.each(TABLA_RUTAS_TICKETS)(
      '$metodo de la ruta con $celdaVieja: sin Bearer → 401 (NUNCA 404 de routing)',
      async (ruta) => {
        const ids = { ticketId: ID, operacionId: ID };
        const { status } = await callMethod(ruta.metodo, ruta.path(ids));
        expect(status).toBe(401);
      },
    );
  });

  // Hasta T9b este bloque sembraba también la celda vieja para probar que ya no concedía nada. Desde
  // T9b esa celda no se puede guardar: el CHECK de la matriz la rechaza.
  describe('Rutas de tickets: actor SIN filas por tipo no ve ni escribe nada', () => {
    it.each(TABLA_RUTAS_TICKETS)(
      '$metodo (antes $celdaVieja) sin filas → $sinFilas, sin cambios en la base',
      async (ruta) => {
        const { ids, clienteId, asignableId } = await fixtureTicketAjeno();
        const actor = await crearActorPorTipo(clienteId, [], []);
        const antes = await fotoDelTicket(ids);

        const { status, data } = await llamarRutaTicket(ruta, ids, asignableId, actor.accessToken);

        if (ruta.sinFilas === 'LISTA_VACIA') {
          // El fixture tiene un ticket que el actor no tiene que ver.
          expect(status).toBe(200);
          expect(data).toMatchObject({ items: [], total: 0 });
        } else {
          expect(status).toBe(ruta.sinFilas);
        }
        expect(await fotoDelTicket(ids)).toEqual(antes);
      },
    );
  });

  describe('Rutas de tickets: actor CON la acción por tipo y SIN ninguna celda TICKETS:* → la operación ocurre', () => {
    it.each(TABLA_RUTAS_TICKETS)(
      '$metodo (antes $celdaVieja) con LECTURA, VER_TODOS y $acciones sobre el tipo → $status con su efecto',
      async (ruta) => {
        const { ids, clienteId, asignableId } = await fixtureTicketAjeno();
        const actor = await crearActorPorTipo(
          clienteId,
          [],
          ['LECTURA', 'VER_TODOS', ...ruta.acciones],
        );

        const { status, data } = await llamarRutaTicket(ruta, ids, asignableId, actor.accessToken);

        expect(status).toBe(ruta.status);
        await ruta.efecto(data, ids, tenantClient, asignableId);
      },
    );
  });

  // ─── Escritura de la Ayuda: exclusiva de ROOT (GlobalAdminGuard por ruta) ──

  describe('Existencia de las rutas de escritura de la Ayuda: sin Bearer → 401', () => {
    it.each(TABLA_RUTAS_ROOT)(
      '$metodo $path existe: sin Bearer → 401 (NUNCA 404 de routing)',
      async ({ metodo, path }) => {
        const { status } = await callMethod(metodo, path);
        expect(status).toBe(401);
      },
    );
  });

  // El assert que sostiene la decisión: la celda de escritura sigue existiendo
  // en el catálogo y se sigue dibujando en la grilla, pero ya NO abre nada. Un
  // actor con la celda sembrada y sin ROOT tiene que seguir chocando contra 403;
  // si alguien reintrodujera `@RequiereAcciones` en el endpoint, este test se
  // pondría rojo.
  describe('GlobalAdminGuard real por ruta: actor con la celda KB:* pero SIN ROOT → 403', () => {
    it.each(TABLA_RUTAS_ROOT)(
      '$metodo $path con $acciones sembradas pero sin is_global_admin → 403',
      async ({ metodo, path, acciones }) => {
        const actor = await crearActorConPermisos(acciones);
        const { status } = await callMethod(metodo, path, actor.accessToken);
        expect(status).toBe(403);
      },
    );
  });

  describe('GlobalAdminGuard real por ruta: actor ROOT → NO 403 (el gate se abrió)', () => {
    it.each(TABLA_RUTAS_ROOT)(
      '$metodo $path con is_global_admin → status distinto de 401/403',
      async ({ metodo, path }) => {
        const actor = await crearActorRoot();
        const { status } = await callMethod(metodo, path, actor.accessToken);
        expect(status).not.toBe(401);
        expect(status).not.toBe(403);
      },
    );
  });

  describe('Lectura de la Ayuda: NO exige ROOT (solo la celda KB:LECTURA)', () => {
    it('GET /kb con KB:LECTURA y sin is_global_admin → 200', async () => {
      const actor = await crearActorConPermisos(['KB:LECTURA']);

      const { status } = await httpGet(`${baseUrl}/kb`, bearer(actor.accessToken));

      expect(status).toBe(200);
    });
  });

  // ─── C4 (fix post-verify) — AdminClienteGuard aplicado por RUTA, no solo el guard en aislamiento ───

  describe('Existencia de las rutas admin (S9/S10, C4): sin Bearer → 401', () => {
    it.each(TABLA_RUTAS_ADMIN)(
      '$metodo $path existe: sin Bearer → 401 (NUNCA 404 de routing)',
      async ({ metodo, path }) => {
        const { status } = await callMethod(metodo, path);
        expect(status).toBe(401);
      },
    );
  });

  describe('AdminClienteGuard real por ruta: actor SIN ser ADMINISTRADOR/ROOT → 403 (S9/S10, C4)', () => {
    it.each(TABLA_RUTAS_ADMIN)(
      '$metodo $path exige ADMINISTRADOR: actor con rol cualquiera → 403',
      async ({ metodo, path }) => {
        const actor = await crearActorConPermisos([]);
        const { status } = await callMethod(metodo, path, actor.accessToken);
        expect(status).toBe(403);
      },
    );
  });

  describe('AdminClienteGuard real por ruta: actor ADMINISTRADOR → NO 403 (S9/S10, C4)', () => {
    it.each(TABLA_RUTAS_ADMIN)(
      '$metodo $path con rol ADMINISTRADOR → status distinto de 401/403 (el gate se abrió)',
      async ({ metodo, path }) => {
        const actor = await crearActorAdministrador();
        const { status } = await callMethod(metodo, path, actor.accessToken);
        expect(status).not.toBe(401);
        expect(status).not.toBe(403);
      },
    );
  });

  // ─── Regresiones puntuales del design (3 asserts) ────────────────────────

  describe('Regresiones puntuales (design §5)', () => {
    it('GET /usuarios con TECNICO (TICKETS:ASIGNAR) → 200, SIN email (R10, R4-excepción)', async () => {
      const actor = await crearActorConPermisos(['TICKETS:ASIGNAR']);
      const { status, data } = await httpGet<{ email?: string }[]>(
        `${baseUrl}/usuarios`,
        bearer(actor.accessToken),
      );
      expect(status).toBe(200);
      expect(data.length).toBeGreaterThan(0);
      expect(data.every((item) => !('email' in item))).toBe(true);
    });

    it('GET /usuarios lo abre VER_TODOS sobre un tipo, no las celdas: 200 con los miembros activos y sin el dado de baja (T6)', async () => {
      const base = await crearActorConPermisos([]);
      const supervisor = await crearActorPorTipo(base.clienteId, [], ['LECTURA', 'VER_TODOS']);
      // Sin filas por tipo no se abre la lista. Hasta T9b este actor tenía las celdas
      // TICKETS:ASIGNAR y TICKETS:VER_TODOS, que desde T6 no la abrían y desde T9b no existen.
      const soloCeldas = await crearActorPorTipo(base.clienteId, [], []);
      const dadoDeBaja = await agregarActorAlCliente(base.clienteId, []);
      await masterClient.membresia.updateMany({
        where: { usuarioId: dadoDeBaja.usuarioId, clienteId: base.clienteId },
        data: { activo: false },
      });

      const lista = await httpGet<{ id: string; email?: string }[]>(
        `${baseUrl}/usuarios`,
        bearer(supervisor.accessToken),
      );
      expect(lista.status).toBe(200);
      expect(lista.data.map((u) => u.id).sort()).toEqual(
        [base.usuarioId, supervisor.usuarioId, soloCeldas.usuarioId].sort(),
      );
      expect(lista.data.map((u) => u.id)).not.toContain(dadoDeBaja.usuarioId);
      expect(lista.data.every((item) => !('email' in item))).toBe(true);

      const rechazado = await httpGet<{ message: string }>(
        `${baseUrl}/usuarios`,
        bearer(soloCeldas.accessToken),
      );
      expect(rechazado.status).toBe(403);
      expect(rechazado.data.message).toBe(
        'Acceso denegado: se requiere ASIGNAR sobre algún tipo de ticket, o VER_TODOS sobre un tipo de Tickets, Compras o Equipos',
      );
    });

    it('POST /usuarios con el mismo token de TECNICO → 403 (ADMIN-o-ROOT exclusivo, R4)', async () => {
      const actor = await crearActorConPermisos(['TICKETS:ASIGNAR']);
      const { status } = await httpPost(
        `${baseUrl}/usuarios`,
        {
          email: 'nuevo@test.local',
          nombre: 'N',
          apellido: 'N',
          password: 'x'.repeat(10),
          rolCodigo: 'TECNICO',
        },
        bearer(actor.accessToken),
      );
      expect(status).toBe(403);
    });

    it('GET /catalogos/tipos-ticket con actor SIN ninguna celda → 200 (la lectura abierta sobrevive, R4)', async () => {
      const actor = await crearActorConPermisos([]);
      const { status } = await httpGet(
        `${baseUrl}/catalogos/tipos-ticket`,
        bearer(actor.accessToken),
      );
      expect(status).toBe(200);
    });
  });

  // ─── R11 (spec-r11, S28-S33) — Scope de FILAS/CAMPOS: solo un assert de ──
  // ─── CONTENIDO lo atrapa, el código de estado NO alcanza ────────────────

  describe('R11 — scope de filas/campos (S28-S33)', () => {
    it('S28: GET /tickets sin TICKETS:VER_TODOS → 200 con EXACTAMENTE los propios (2 propios, 3 ajenos en el fixture)', async () => {
      const propio = await crearActorConPermisos(['TICKETS:LECTURA', 'TICKETS:ALTAS']);
      const ajeno = await agregarActorAlCliente(propio.clienteId, ['TICKETS:ALTAS']);

      const t1 = await crearTicket(propio.accessToken, { titulo: 'Propio 1' });
      const t2 = await crearTicket(propio.accessToken, { titulo: 'Propio 2' });
      await crearTicket(ajeno.accessToken, { titulo: 'Ajeno 1' });
      await crearTicket(ajeno.accessToken, { titulo: 'Ajeno 2' });
      await crearTicket(ajeno.accessToken, { titulo: 'Ajeno 3' });

      const { status, data } = await httpGet<{ items: TicketResponseDto[] }>(
        `${baseUrl}/tickets`,
        bearer(propio.accessToken),
      );

      expect(status).toBe(200);
      expect(data.items).toHaveLength(2);
      expect(new Set(data.items.map((t) => t.id))).toEqual(new Set([t1.id, t2.id]));
      expect(data.items.every((t) => t.solicitanteId === propio.usuarioId)).toBe(true);
    });

    it('S29: GET /tickets/:id de un ticket AJENO sin TICKETS:VER_TODOS → 404 (nunca 403, no revela existencia)', async () => {
      const propio = await crearActorConPermisos(['TICKETS:LECTURA', 'TICKETS:ALTAS']);
      const ajeno = await agregarActorAlCliente(propio.clienteId, ['TICKETS:ALTAS']);
      const ticketAjeno = await crearTicket(ajeno.accessToken);

      const { status } = await httpGet(
        `${baseUrl}/tickets/${ticketAjeno.id}`,
        bearer(propio.accessToken),
      );

      expect(status).toBe(404);
    });

    // El editor es ROOT: escribir la Ayuda dejó de estar al alcance de una
    // celda de la matriz. El LECTOR, en cambio, sigue siendo un actor común con
    // `KB:LECTURA` — que es lo que este test mide.
    it('S30: GET /kb sin KB:VER_TODOS → 200 con EXACTAMENTE los publicados+activos (3 publicados, 2 sin publicar en el fixture)', async () => {
      const editor = await crearActorRoot();
      const lector = await agregarActorAlCliente(editor.clienteId, ['KB:LECTURA']);

      const p1 = await crearArticuloKb(editor.accessToken, { titulo: 'Publicado 1' });
      const p2 = await crearArticuloKb(editor.accessToken, { titulo: 'Publicado 2' });
      const p3 = await crearArticuloKb(editor.accessToken, { titulo: 'Publicado 3' });
      await publicarArticuloKb(editor.accessToken, p1.id);
      await publicarArticuloKb(editor.accessToken, p2.id);
      await publicarArticuloKb(editor.accessToken, p3.id);
      await crearArticuloKb(editor.accessToken, { titulo: 'Sin publicar 1' });
      await crearArticuloKb(editor.accessToken, { titulo: 'Sin publicar 2' });

      const { status, data } = await httpGet<{ items: KbArticuloResponseDto[] }>(
        `${baseUrl}/kb`,
        bearer(lector.accessToken),
      );

      expect(status).toBe(200);
      expect(data.items).toHaveLength(3);
      expect(new Set(data.items.map((a) => a.id))).toEqual(new Set([p1.id, p2.id, p3.id]));
      expect(data.items.every((a) => a.visibleParaSolicitante && a.activo)).toBe(true);
    });

    it('S31: GET /kb/:id de un artículo SIN publicar, sin KB:VER_TODOS → 404 (no revela existencia)', async () => {
      const editor = await crearActorRoot();
      const lector = await agregarActorAlCliente(editor.clienteId, ['KB:LECTURA']);
      const sinPublicar = await crearArticuloKb(editor.accessToken);

      const { status } = await httpGet(
        `${baseUrl}/kb/${sinPublicar.id}`,
        bearer(lector.accessToken),
      );

      expect(status).toBe(404);
    });

    it('S32: GET /tickets/:id/timeline sin TICKETS:OBSERVAR → 200 SIN operaciones internas (mezcla de internas/públicas en el fixture)', async () => {
      const solicitante = await crearActorConPermisos([
        'TICKETS:LECTURA',
        'TICKETS:ALTAS',
        'TICKETS:COMENTAR',
      ]);
      // Con LECTURA: sin Ver sobre el tipo no ve el ticket y su comentario interno no existiría.
      const observador = await agregarActorAlCliente(solicitante.clienteId, [
        'TICKETS:LECTURA',
        'TICKETS:VER_TODOS',
        'TICKETS:OBSERVAR',
        'TICKETS:COMENTAR',
      ]);
      const ticket = await crearTicket(solicitante.accessToken);

      await httpPost(
        `${baseUrl}/tickets/${ticket.id}/comentarios`,
        { texto: 'Comentario público', esInterno: false },
        bearer(solicitante.accessToken),
      );
      const interno = await httpPost(
        `${baseUrl}/tickets/${ticket.id}/comentarios`,
        { texto: 'Comentario interno', esInterno: true },
        bearer(observador.accessToken),
      );
      // El fixture tiene que contener la interna que el solicitante no debe ver.
      expect(interno.status).toBe(201);

      const { status, data } = await httpGet<OperacionResponseDto[]>(
        `${baseUrl}/tickets/${ticket.id}/timeline`,
        bearer(solicitante.accessToken),
      );

      expect(status).toBe(200);
      expect(data.length).toBeGreaterThan(0);
      expect(data.some((op) => op.esInterno)).toBe(false);
    });

    it('S33: GET /tickets/:id/timeline de un ticket AJENO sin TICKETS:VER_TODOS → 404 (capa de fila, evaluada ANTES que la de campo)', async () => {
      const propio = await crearActorConPermisos(['TICKETS:LECTURA', 'TICKETS:ALTAS']);
      const ajeno = await agregarActorAlCliente(propio.clienteId, ['TICKETS:ALTAS']);
      const ticketAjeno = await crearTicket(ajeno.accessToken);

      const { status } = await httpGet(
        `${baseUrl}/tickets/${ticketAjeno.id}/timeline`,
        bearer(propio.accessToken),
      );

      expect(status).toBe(404);
    });
  });

  // ─── Permisos por tipo desde Admin → Usuarios (odd/permisos-por-tipo-ticket, T7, S5) ──────

  describe('Permisos por tipo desde Admin → Usuarios (T7, S5)', () => {
    /** Filas del usuario en la tabla del tenant, leídas sin pasar por la API. */
    async function filasEnLaBase(usuarioId: string): Promise<string[]> {
      const filas = await tenantClient.permisoTipoTicket.findMany({ where: { usuarioId } });
      return filas
        .map((f) => `${f.tipoId === tipoSoporteId ? 'SOPORTE' : f.tipoId}:${f.accion}`)
        .sort();
    }

    interface RespuestaPorTipo {
      sinRestriccion: boolean;
      tipos: { tipoId: string; nombre: string; acciones: string[]; plantilla: string[] | null }[];
    }

    it('GET devuelve la fila de cada tipo con las acciones del usuario; un ROOT del cliente vuelve sin restricción', async () => {
      const adminCliente = await crearActorAdministrador();
      const tecnico = await crearActorPorTipo(adminCliente.clienteId, [], ['LECTURA', 'COMENTAR']);
      const root = await crearUsuario(true);
      const rolRoot = await crearRoleVacio();
      await masterClient.membresia.create({
        data: {
          usuarioId: root.id,
          clienteId: adminCliente.clienteId,
          rolId: rolRoot.id,
          activo: true,
        },
      });

      const { status, data } = await httpGet<RespuestaPorTipo>(
        `${baseUrl}/usuarios/${tecnico.usuarioId}/permisos-por-tipo`,
        bearer(adminCliente.accessToken),
      );
      const deRoot = await httpGet<RespuestaPorTipo>(
        `${baseUrl}/usuarios/${root.id}/permisos-por-tipo`,
        bearer(adminCliente.accessToken),
      );

      expect(status).toBe(200);
      expect(data.sinRestriccion).toBe(false);
      // El rol del fixture no tiene plantilla definida: `plantilla` viaja en null, no vacía.
      expect(data.tipos.find((t) => t.tipoId === tipoSoporteId)).toMatchObject({
        acciones: ['LECTURA', 'COMENTAR'],
        plantilla: null,
      });
      expect(deRoot.status).toBe(200);
      expect(deRoot.data).toMatchObject({ sinRestriccion: true, tipos: [] });
    });

    it('el próximo request del usuario ya ve lo que el administrador guardó, con el mismo token (D1)', async () => {
      const adminCliente = await crearActorAdministrador();
      const tecnico = await crearActorPorTipo(adminCliente.clienteId, [], []);
      const antes = await httpGet(`${baseUrl}/usuarios`, bearer(tecnico.accessToken));

      const guardado = await httpPut<RespuestaPorTipo>(
        `${baseUrl}/usuarios/${tecnico.usuarioId}/permisos-por-tipo`,
        { tipos: [{ tipoId: tipoSoporteId, acciones: ['LECTURA', 'ASIGNAR'] }] },
        bearer(adminCliente.accessToken),
      );
      const despues = await httpGet(`${baseUrl}/usuarios`, bearer(tecnico.accessToken));

      expect(antes.status).toBe(403);
      expect(guardado.status).toBe(200);
      expect(guardado.data.tipos.find((t) => t.tipoId === tipoSoporteId)?.acciones).toEqual([
        'LECTURA',
        'ASIGNAR',
      ]);
      await expect(filasEnLaBase(tecnico.usuarioId)).resolves.toEqual([
        'SOPORTE:ASIGNAR',
        'SOPORTE:LECTURA',
      ]);
      expect(despues.status).toBe(200);
    });

    it('PUT con una acción sin Ver: 422 con el mensaje en español y las filas sin tocar (S3)', async () => {
      const adminCliente = await crearActorAdministrador();
      const tecnico = await crearActorPorTipo(adminCliente.clienteId, [], ['LECTURA']);
      const { nombre } = await tenantClient.tipoTicket.findUniqueOrThrow({
        where: { id: tipoSoporteId },
      });

      const { status, data } = await httpPut<{ message: string }>(
        `${baseUrl}/usuarios/${tecnico.usuarioId}/permisos-por-tipo`,
        { tipos: [{ tipoId: tipoSoporteId, acciones: ['VER_TODOS', 'MODIFICACION'] }] },
        bearer(adminCliente.accessToken),
      );

      expect(status).toBe(422);
      expect(data.message).toBe(
        `Sin Ver no se puede conceder ninguna otra acción en el tipo «${nombre}» (se pidió VER_TODOS, MODIFICACION).`,
      );
      await expect(filasEnLaBase(tecnico.usuarioId)).resolves.toEqual(['SOPORTE:LECTURA']);
    });

    it('PUT sobre un ADMINISTRADOR: 422; un usuario sin membresía en el cliente: 404', async () => {
      const adminCliente = await crearActorAdministrador();
      // Una sola base de tenant por suite (db_name único): el ajeno es un usuario sin membresía acá.
      const ajeno = { usuarioId: (await crearUsuario()).id };

      const sobreAdmin = await httpPut(
        `${baseUrl}/usuarios/${adminCliente.usuarioId}/permisos-por-tipo`,
        { tipos: [] },
        bearer(adminCliente.accessToken),
      );
      const sobreAjeno = await httpPut(
        `${baseUrl}/usuarios/${ajeno.usuarioId}/permisos-por-tipo`,
        { tipos: [] },
        bearer(adminCliente.accessToken),
      );

      expect(sobreAdmin.status).toBe(422);
      expect(sobreAjeno.status).toBe(404);
    });

    it('copiar reemplaza las filas del destino por las del origen', async () => {
      const adminCliente = await crearActorAdministrador();
      const origen = await crearActorPorTipo(adminCliente.clienteId, [], ['LECTURA', 'VER_TODOS']);
      const destino = await crearActorPorTipo(adminCliente.clienteId, [], ['LECTURA', 'ALTAS']);

      const { status } = await httpPost(
        `${baseUrl}/usuarios/${destino.usuarioId}/permisos-por-tipo/copiar-de/${origen.usuarioId}`,
        {},
        bearer(adminCliente.accessToken),
      );

      expect(status).toBe(200);
      await expect(filasEnLaBase(destino.usuarioId)).resolves.toEqual([
        'SOPORTE:LECTURA',
        'SOPORTE:VER_TODOS',
      ]);
    });
  });
});
