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
import { SectoresModule } from '../../sectores.module';
import { TenantScopeMiddleware } from '../../../shared/tenancy/tenant-scope.middleware';

import { PrismaService } from '../../../shared/infrastructure/persistence/prisma.service';
import { MasterPrismaClient } from '../../../shared/infrastructure/persistence/prisma-clients';
import { PostgresAdminService } from '../../../clientes/infrastructure/postgres-admin.service';
import { TenantMigrationRunnerAdapter } from '../../../clientes/infrastructure/tenant-migration-runner.adapter';
import { PrismaClienteRepository } from '../../../clientes/infrastructure/persistence/prisma/prisma-cliente.repository';
import { PrismaUsuarioRepository } from '../../../auth/infrastructure/persistence/prisma/prisma-usuario.repository';
import { ClienteEntity } from '../../../clientes/domain/entities/cliente.entity';
import { UsuarioEntity } from '../../../auth/domain/entities/usuario.entity';
import { RoleEntity } from '../../../auth/domain/entities/role.entity';
import { Argon2HashProvider } from '../../../auth/infrastructure/argon2-hash.provider';
import { SectorResponseDto } from '../dtos/sectores.dto';

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

@Module({ imports: [SharedModule, AuthModule, SectoresModule] })
class TestHarnessModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantScopeMiddleware).forRoutes('*');
  }
}

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

  afterAll(async () => {
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

  /** Actor con el rol dado (`'ADMINISTRADOR'` bypassea `AdminClienteGuard`; cualquier otro NO). */
  async function crearActorConRol(rolCodigo: string): Promise<{ accessToken: string }> {
    const cliente = await crearClienteTenant();
    const role = await createRole(
      rolCodigo === 'ADMINISTRADOR' ? 'ADMINISTRADOR' : `ROL_E2E_${randomBytes(3).toString('hex')}`,
    );
    const usuario = await createUsuario(randomBytes(3).toString('hex'));
    await createMembresia(usuario.id, cliente.id, role.id);
    return login(usuario.email);
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
    it('GET /sectores: actor autenticado SIN rol ADMINISTRADOR → 200 (lectura abierta, S65)', async () => {
      const actor = await crearActorConRol('USUARIO');

      const { status } = await httpGet(`${baseUrl}/sectores`, bearer(actor.accessToken));

      expect(status).toBe(200);
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

      const editar = await fetch(`${baseUrl}/sectores/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...bearer(admin.accessToken) },
        body: JSON.stringify({ nombre: 'Librería y Papelería' }),
      });
      expect(editar.status).toBe(200);

      const desactivar = await fetch(`${baseUrl}/sectores/${id}/estado`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...bearer(admin.accessToken) },
        body: JSON.stringify({ activo: false }),
      });
      expect(desactivar.status).toBe(200);

      const listado = await httpGet<SectorResponseDto[]>(
        `${baseUrl}/sectores`,
        bearer(admin.accessToken),
      );
      expect(listado.data.find((s) => s.id === id)).toBeUndefined();
    });
  });
});
