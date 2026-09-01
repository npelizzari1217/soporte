/**
 * sectores.e2e.spec.ts — WU-08 (sdd/compras-tres-etapas-y-sectores,
 * OBLIGATORIO, no ceremonia). Levanta la app REAL (Nest, sin mocks de
 * infraestructura) y pega por HTTP a `/sectores`. Dos motivos, ninguno
 * cubierto por unit tests:
 *
 * 1. El gate por MÉTODO de `SectoresController` (S64/S65): un
 *    `@UseGuards(AdminClienteGuard)` puesto a nivel de CLASE por descuido
 *    pasa TODOS los unit tests del controller (que mockean el guard fuera
 *    de la ecuación) y rompe la lectura abierta de S65. Solo un request
 *    HTTP real con un JWT sin rol ADMINISTRADOR lo detecta.
 * 2. El grafo DI completo: `Test.createTestingModule({ imports:
 *    [TestHarnessModule] }).compile()` compila el `useFactory` real de
 *    `SectoresModule`, cosa que `sectores.module.spec.ts` (metadata leída a
 *    mano) no hace.
 *
 * Mismo patrón que `compras.e2e.spec.ts` (provisioning de tenant efímero,
 * fetch nativo, orden app.close() → limpieza → onModuleDestroy() →
 * dropDatabase). Sin `AccionesGuard`/matriz de permisos: el gate acá es
 * 100% por rol (`AdminClienteGuard`), no hay celdas `MODULO:ACCION`.
 *
 * Ref spec: sdd/compras-tres-etapas-y-sectores/spec R10, S63-S65.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import {
  Controller,
  Get,
  INestApplication,
  MiddlewareConsumer,
  Module,
  NestModule,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { SharedModule } from '../../../shared/shared.module';
import { AuthModule } from '../../../auth/auth.module';
import { SectoresModule } from '../../sectores.module';
import { TenantScopeMiddleware } from '../../../shared/tenancy/tenant-scope.middleware';

import { PrismaService } from '../../../shared/infrastructure/persistence/prisma.service';
import { MasterPrismaClient } from '../../../shared/infrastructure/persistence/prisma-clients';
import { PostgresAdminService } from '../../../clientes/infrastructure/postgres-admin.service';
import { TenantMigrationRunnerAdapter } from '../../../clientes/infrastructure/tenant-migration-runner.adapter';
import { PrismaClienteRepository } from '../../../clientes/infrastructure/persistence/prisma/prisma-cliente.repository';
import { PrismaUsuarioRepository } from '../../../auth/infrastructure/persistence/prisma/prisma-usuario.repository';
import { ClienteEntity } from '../../../clientes/domain/entities/cliente.entity';
import { ZonaHoraria } from '../../../shared/domain/zona-horaria';
import { UsuarioEntity } from '../../../auth/domain/entities/usuario.entity';
import { RoleEntity } from '../../../auth/domain/entities/role.entity';
import { Argon2HashProvider } from '../../../auth/infrastructure/argon2-hash.provider';
import { SectorResponseDto } from '../dtos/sectores.dto';
import { usarLockMasterTest } from '../../../testing/lock-master-test';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const TENANT_DB_NAME = `soporte_prov_sectoresE2E_${randomBytes(4).toString('hex')}_test`;
const PLAINTEXT_PASSWORD = 'E2eSectoresSecret!123';

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

/**
 * Hermano de `httpPost` para PATCH. Existe para que las llamadas de edición
 * hereden el `.json().catch(() => null)`: escritas a mano con `fetch`, un body
 * vacío o no-JSON hacía explotar el test con un error de parseo en vez de
 * mostrar el status que se estaba probando.
 */
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

/**
 * Controller de TEST, no de producción (sdd/filtro-prisma, tarea 3.3). Existe
 * únicamente para probar el hermano invertido de R4: un error NO reconocido
 * por `PrismaExceptionFilter` (un `Error` pelado, sin `name`/`code` de
 * Prisma) tiene que seguir dando 500 después de registrar el filtro global.
 * Vive DENTRO de este spec — no suma ruta real ni archivo de código.
 */
@Controller('__test-boom__')
class TestBoomController {
  @Get()
  explotar(): never {
    throw new Error('boom no reconocido por el filtro');
  }
}

/**
 * Controller de TEST, no de producción (sdd/filtro-prisma, fix post-review
 * H5). Dispara un `P2003` REAL (violación de FK) contra la master de test:
 * `Membresia.usuarioId/clienteId/rolId` son las tres `@relation` requeridas
 * de `membresias` (`prisma_master/schema.prisma`), y ninguna de las tres
 * existencias se pre-chequea en un `INSERT` directo — a diferencia de
 * `codigo`/`nombre` (P2000), la existencia de un id referenciado NO es un
 * límite de FORMA validable con `@MaxLength`/`@Matches`: exige una consulta a
 * la base, que es justo lo que ninguna capa de arriba hace acá. Es el caso
 * que ADR-1/ADR-7 describen como el único camino real a P2002/P2003: un
 * conflicto de integridad que el dominio no pre-chequea.
 */
@Controller('__test-fk-violation__')
class TestFkViolationController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async violarForeignKey(): Promise<never> {
    await this.prisma.getMasterClient().membresia.create({
      data: { usuarioId: randomUUID(), clienteId: randomUUID(), rolId: randomUUID(), activo: true },
    });
    throw new Error(
      'unreachable — el create de arriba tiene que rechazar por FK antes de llegar acá',
    );
  }
}

@Module({
  imports: [SharedModule, AuthModule, SectoresModule],
  controllers: [TestBoomController, TestFkViolationController],
})
class TestHarnessModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantScopeMiddleware).forRoutes('*');
  }
}

// Turno exclusivo sobre la master de test compartida — ver src/testing/lock-master-test.ts.
usarLockMasterTest();

describe('Sectores e2e — gate por método + grafo DI real (WU-08)', () => {
  let app: INestApplication;
  let baseUrl: string;

  let prismaService: PrismaService;
  let masterClient: InstanceType<typeof MasterPrismaClient>;
  let clienteRepo: PrismaClienteRepository;
  let usuarioRepo: PrismaUsuarioRepository;
  let hashProvider: Argon2HashProvider;

  const admin = new PostgresAdminService(MASTER_TEST_URL);

  beforeAll(async () => {
    if (!process.env.DATABASE_URL_MASTER) {
      process.env.DATABASE_URL_MASTER = MASTER_TEST_URL;
    }

    await admin.createDatabase(TENANT_DB_NAME);
    await new TenantMigrationRunnerAdapter(MASTER_TEST_URL).run(TENANT_DB_NAME);

    prismaService = new PrismaService(MASTER_TEST_URL);
    masterClient = prismaService.getMasterClient();
    clienteRepo = new PrismaClienteRepository(prismaService);
    usuarioRepo = new PrismaUsuarioRepository(prismaService);
    hashProvider = new Argon2HashProvider();

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

  // El cierre se traga el error a propósito para que `dropDatabase` corra
  // igual — si no, un cierre fallido deja una base efímera huérfana. Pero se
  // loguea: tragar en silencio convierte el próximo huérfano en un misterio.
  afterAll(async () => {
    try {
      await app?.close();
    } catch (error) {
      console.error('[teardown] app.close() falló, sigo al dropDatabase igual:', error);
    }
    try {
      await prismaService?.onModuleDestroy();
    } catch (error) {
      console.error('[teardown] onModuleDestroy() falló, sigo al dropDatabase igual:', error);
    }
    await admin.dropDatabase(TENANT_DB_NAME);
  }, 60_000);

  beforeEach(async () => {
    await masterClient.$executeRawUnsafe(
      'TRUNCATE TABLE membresias, refresh_tokens, usuarios, clientes, roles RESTART IDENTITY CASCADE',
    );
  });

  async function crearClienteTenant(): Promise<ClienteEntity> {
    const cliente = ClienteEntity.create({
      nombre: `E2E Sectores ${randomBytes(3).toString('hex')}`,
      razonSocial: null,
      cuit: null,
      dbName: TENANT_DB_NAME,
      activo: true,
      zonaHoraria: ZonaHoraria.crear('America/Argentina/Buenos_Aires'),
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
      email: `e2e_sectores_${suffix}@test.local`,
      nombre: 'E2E',
      apellido: 'Sectores',
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
   * Actor con el rol dado (`'ADMINISTRADOR'` bypassea `AdminClienteGuard`;
   * cualquier otro NO). `clienteIdExistente` (fix C3) permite compartir el
   * MISMO cliente/tenant entre dos actores de un mismo test — `crearClienteTenant()`
   * usa `TENANT_DB_NAME` fijo por archivo, así que una 2ª llamada sin
   * reusar el cliente choca contra el `db_name` UNIQUE.
   */
  async function crearActorConRol(
    rolCodigo: string,
    clienteIdExistente?: string,
  ): Promise<{ accessToken: string; clienteId: string }> {
    const clienteId = clienteIdExistente ?? (await crearClienteTenant()).id;
    const role = await createRole(
      rolCodigo === 'ADMINISTRADOR' ? 'ADMINISTRADOR' : `ROL_E2E_${randomBytes(3).toString('hex')}`,
    );
    const usuario = await createUsuario(randomBytes(3).toString('hex'));
    await createMembresia(usuario.id, clienteId, role.id);
    const { accessToken } = await login(usuario.email);
    return { accessToken, clienteId };
  }

  describe('Gating de acceso', () => {
    it('sin JWT → 401 en GET /sectores y en POST /sectores', async () => {
      const consulta = await httpGet(`${baseUrl}/sectores`);
      const comando = await httpPost(`${baseUrl}/sectores`, { codigo: 'X', nombre: 'X' });
      expect(consulta.status).toBe(401);
      expect(comando.status).toBe(401);
    });
  });

  describe('Gate por MÉTODO (S64/S65) — nunca por clase', () => {
    // El assert es de CONTENIDO y no solo de status: un 200 no prueba lectura
    // abierta si la ruta devuelve el subconjunto de filas equivocado. El actor
    // se crea sobre el MISMO cliente que el admin, así que ver la fila sembrada
    // distingue "leo lo que tengo que leer" de "no me rebotó".
    it('GET /sectores: actor autenticado SIN rol ADMINISTRADOR → 200 y ve el catálogo (S65)', async () => {
      const adminActor = await crearActorConRol('ADMINISTRADOR');
      const sembrado = await httpPost<SectorResponseDto>(
        `${baseUrl}/sectores`,
        { codigo: 'LECTURA_ABIERTA', nombre: 'Lectura abierta' },
        bearer(adminActor.accessToken),
      );
      expect(sembrado.status).toBe(201);

      const actor = await crearActorConRol('USUARIO', adminActor.clienteId);

      const { status, data } = await httpGet<SectorResponseDto[]>(
        `${baseUrl}/sectores`,
        bearer(actor.accessToken),
      );

      expect(status).toBe(200);
      expect(data.find((s) => s.id === sembrado.data.id)?.codigo).toBe('LECTURA_ABIERTA');
    });

    it('POST /sectores: actor autenticado SIN rol ADMINISTRADOR → 403 (S64)', async () => {
      const actor = await crearActorConRol('USUARIO');

      const { status } = await httpPost(
        `${baseUrl}/sectores`,
        { codigo: 'COMPUTACION', nombre: 'Computación' },
        bearer(actor.accessToken),
      );

      expect(status).toBe(403);
    });

    it('POST /sectores: actor con rol ADMINISTRADOR → 201 (S63)', async () => {
      const actor = await crearActorConRol('ADMINISTRADOR');

      const { status, data } = await httpPost<SectorResponseDto>(
        `${baseUrl}/sectores`,
        { codigo: 'COMPUTACION', nombre: 'Computación' },
        bearer(actor.accessToken),
      );

      expect(status).toBe(201);
      expect(data.codigo).toBe('COMPUTACION');
    });

    // Fix post-verify C3: `sectores.controller.spec.ts:234` (pre-fix) SOLO
    // cubría el 403 de POST — PATCH /sectores/:id y PATCH
    // /sectores/:id/estado nunca se pidieron sin rol ADMINISTRADOR contra la
    // app real. Un unit test mockea el guard fuera de la ecuación (JSDoc del
    // header de este archivo) — solo un request HTTP real lo detecta.
    it('PATCH /sectores/:id: actor autenticado SIN rol ADMINISTRADOR → 403 (S64)', async () => {
      const admin = await crearActorConRol('ADMINISTRADOR');
      const crear = await httpPost<SectorResponseDto>(
        `${baseUrl}/sectores`,
        { codigo: 'DEPORTES', nombre: 'Deportes' },
        bearer(admin.accessToken),
      );
      const id = crear.data.id;

      const actor = await crearActorConRol('USUARIO', admin.clienteId);
      const editar = await httpPatch(
        `${baseUrl}/sectores/${id}`,
        { nombre: 'Deportes y Recreación' },
        bearer(actor.accessToken),
      );

      expect(editar.status).toBe(403);
    });

    it('PATCH /sectores/:id/estado: actor autenticado SIN rol ADMINISTRADOR → 403 (S64)', async () => {
      const admin = await crearActorConRol('ADMINISTRADOR');
      const crear = await httpPost<SectorResponseDto>(
        `${baseUrl}/sectores`,
        { codigo: 'JARDINERIA', nombre: 'Jardinería' },
        bearer(admin.accessToken),
      );
      const id = crear.data.id;

      const actor = await crearActorConRol('USUARIO', admin.clienteId);
      const cambiarEstado = await httpPatch(
        `${baseUrl}/sectores/${id}/estado`,
        { activo: false },
        bearer(actor.accessToken),
      );

      expect(cambiarEstado.status).toBe(403);
    });
  });

  // sdd/filtro-prisma — backstop 4xx de PrismaExceptionFilter. Estos tests
  // fueron RED por AUSENCIA DE WIRING hasta la tarea 3.4 (el filtro ya
  // existía, pero `shared.module.ts` todavía no lo registraba como
  // `APP_FILTER`): daban 500 antes de esa tarea. `shared.module.ts` SÍ lo
  // registra hoy (ver ADR-5) y los dos tests de abajo están en GREEN.
  //
  // Fix post-review H5: el test original de este describe mandaba un
  // `codigo` de 60 chars a `POST /sectores` para forzar un P2000 real. Con el
  // `@MaxLength(50)` agregado a `CreateSectorDto` (mismo fix, ver
  // `sectores.dto.ts`), ese caso lo frena `ValidationPipe` ANTES de llegar a
  // Prisma — dejó de ejercitar el filtro y encima el mensaje de
  // class-validator nombra el campo (`codigo must be shorter than...`),
  // violando la propia aserción de no-fuga que el test hacía. Se reemplaza
  // por `TestFkViolationController` (P2003): la existencia de un id
  // referenciado no es un límite de FORMA validable en el DTO, así que sigue
  // siendo un caso genuinamente no anticipable por esa capa.
  describe('PrismaExceptionFilter — backstop 4xx (sdd/filtro-prisma)', () => {
    it('GET /__test-fk-violation__ (FK inexistente) → 409 sin fuga de esquema (R1/R3, P2003)', async () => {
      const { status, data } = await httpGet<Record<string, unknown>>(
        `${baseUrl}/__test-fk-violation__`,
      );

      expect(status).toBe(409);

      const cuerpoComoTexto = JSON.stringify(data);
      // R3 — sin fuga de esquema: ni la tabla, ni la columna, ni el nombre del constraint.
      expect(cuerpoComoTexto).not.toContain('membresias');
      expect(cuerpoComoTexto).not.toContain('usuario_id');
      expect(cuerpoComoTexto).not.toContain('cliente_id');
      expect(cuerpoComoTexto).not.toContain('rol_id');
      expect(cuerpoComoTexto.toLowerCase()).not.toContain('foreign key');
      expect(cuerpoComoTexto.toLowerCase()).not.toContain('constraint');
      // Hermano invertido de R3 — el mensaje fijo SÍ tiene que estar.
      expect(cuerpoComoTexto).toContain(
        'La operación afecta datos relacionados y no se puede completar.',
      );
    });

    it('GET /__test-boom__ (Error no reconocido por el filtro) → sigue en 500 (R4, hermano invertido)', async () => {
      const { status } = await httpGet(`${baseUrl}/__test-boom__`);

      expect(status).toBe(500);
    });
  });

  describe('Flujo feliz: crear → editar → desactivar → listado excluye', () => {
    it('atraviesa la app real de punta a punta', async () => {
      const admin = await crearActorConRol('ADMINISTRADOR');

      const crear = await httpPost<SectorResponseDto>(
        `${baseUrl}/sectores`,
        { codigo: 'LIBRERIA', nombre: 'Librería' },
        bearer(admin.accessToken),
      );
      expect(crear.status).toBe(201);
      const id = crear.data.id;

      const editar = await httpPatch(
        `${baseUrl}/sectores/${id}`,
        { nombre: 'Librería y Papelería' },
        bearer(admin.accessToken),
      );
      expect(editar.status).toBe(200);

      // Hermano invertido del assert de ausencia de abajo. Sin este listado
      // previo, el `toBeUndefined()` final pasa en verde aunque `GET /sectores`
      // devuelva `[]` SIEMPRE — un tenant scope roto, un filtro mal armado o un
      // middleware que no resuelve el tenant se ven los tres idénticos a "el
      // desactivado quedó excluido". Además confirma que el PATCH persistió:
      // hasta acá el `status === 200` era lo único que lo respaldaba.
      const listadoActivo = await httpGet<SectorResponseDto[]>(
        `${baseUrl}/sectores`,
        bearer(admin.accessToken),
      );
      expect(listadoActivo.data.find((s) => s.id === id)?.nombre).toBe('Librería y Papelería');

      const desactivar = await httpPatch(
        `${baseUrl}/sectores/${id}/estado`,
        { activo: false },
        bearer(admin.accessToken),
      );
      expect(desactivar.status).toBe(200);

      const listado = await httpGet<SectorResponseDto[]>(
        `${baseUrl}/sectores`,
        bearer(admin.accessToken),
      );
      expect(listado.data.find((s) => s.id === id)).toBeUndefined();
    });
  });
});
