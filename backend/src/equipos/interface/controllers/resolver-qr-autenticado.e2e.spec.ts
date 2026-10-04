/**
 * resolver-qr-autenticado.e2e.spec.ts — `GET /soporte/qr?c=&e=` (sdd/formulario-publico-qr,
 * WU-17; ADR-9).
 *
 * App real contra Postgres real y guards reales (JWT, tenant, acciones): tenant efímero,
 * `soporte_master_test` truncada en `beforeEach` y `usarLockMasterTest()`. Un actor por test:
 * dos clientes con el mismo `dbName` violan el UNIQUE de `clientes.db_name`. Cubre 401/403, el
 * orden de rutas (`/soporte/qr` no llega a `:ticketId`), el slug de otra organización y el
 * token de un equipo dado de baja.
 */
import { createHash, randomBytes } from 'node:crypto';
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
import { EquiposModule } from '../../equipos.module';
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
import { Argon2HashProvider } from '../../../auth/infrastructure/argon2-hash.provider';
import { usarLockMasterTest } from '../../../testing/lock-master-test';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const TENANT_DB_NAME = `soporte_prov_resolverQrE2E_${randomBytes(4).toString('hex')}_test`;
const PLAINTEXT_PASSWORD = 'E2eResolverQrSecret!123';

interface Respuesta<T> {
  status: number;
  data: T;
}

interface CuerpoQr {
  equipo?: { id: string; nombre: string } | null;
  statusCode?: number;
  message?: string;
}

async function get(url: string, token?: string): Promise<Respuesta<CuerpoQr>> {
  const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return { status: res.status, data: (await res.json().catch(() => null)) as CuerpoQr };
}

const sha256 = (valor: string): string => createHash('sha256').update(valor).digest('hex');

@Module({ imports: [SharedModule, AuthModule, EquiposModule] })
class TestHarnessModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantScopeMiddleware).forRoutes('*');
  }
}

usarLockMasterTest();

describe('Soporte e2e — GET /soporte/qr (WU-17)', () => {
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

  beforeAll(async () => {
    if (!process.env.DATABASE_URL_MASTER) {
      process.env.DATABASE_URL_MASTER = MASTER_TEST_URL;
    }
    await admin.createDatabase(TENANT_DB_NAME);
    await new TenantMigrationRunnerAdapter(MASTER_TEST_URL).run(TENANT_DB_NAME);

    prismaService = new PrismaService(MASTER_TEST_URL);
    masterClient = prismaService.getMasterClient();
    tenantClient = prismaService.getTenantClient(TENANT_DB_NAME);
    clienteRepo = new PrismaClienteRepository(prismaService);
    usuarioRepo = new PrismaUsuarioRepository(prismaService);
    permisosRepo = new PrismaMatrizPermisosRepository(prismaService);
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
    // Orden CRÍTICO: filas → app.close() → dropDatabase. Al revés, el DROP falla en silencio.
    try {
      await tenantClient.equipoInformatico.deleteMany();
    } catch {
      /* no-op */
    }
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
    await tenantClient.equipoInformatico.deleteMany();
  });

  async function crearActor(
    permisos: string[],
    slug: string | null,
  ): Promise<{ accessToken: string; clienteId: string }> {
    const cliente = ClienteEntity.create({
      nombre: `E2E Resolver QR ${randomBytes(3).toString('hex')}`,
      razonSocial: null,
      cuit: null,
      dbName: TENANT_DB_NAME,
      activo: true,
      slug,
    });
    await clienteRepo.save(cliente);
    if (slug !== null) {
      // `save()` no escribe el slug (solo los CAS lo hacen): se carga por el camino real.
      await clienteRepo.cambiarSlugSiNoCongelado(cliente.id, slug);
    }
    const role = RoleEntity.create({
      codigo: `ROL_E2E_${randomBytes(3).toString('hex')}`,
      nombre: 'rol',
      descripcion: null,
      permisos: [],
    });
    await masterClient.role.create({
      data: { id: role.id, codigo: role.codigo, nombre: role.nombre },
    });
    const usuario = UsuarioEntity.create({
      email: `e2e_resolver_qr_${randomBytes(3).toString('hex')}@test.local`,
      nombre: 'E2E',
      apellido: 'ResolverQr',
      passwordHash: await hashProvider.hash(PLAINTEXT_PASSWORD),
      activo: true,
      isGlobalAdmin: false,
    });
    await usuarioRepo.save(usuario);
    await masterClient.membresia.create({
      data: { usuarioId: usuario.id, clienteId: cliente.id, rolId: role.id, activo: true },
    });
    await permisosRepo.setPermisos(usuario.id, cliente.id, permisos);
    const login = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: usuario.email, password: PLAINTEXT_PASSWORD }),
    });
    const { accessToken } = (await login.json()) as { accessToken: string };
    return { accessToken, clienteId: cliente.id };
  }

  async function crearEquipo(
    token: string,
    extra: { activo?: boolean; nombre?: string } = {},
  ): Promise<string> {
    return (
      await tenantClient.equipoInformatico.create({
        data: { nombre: 'PC-QR', qrTokenHash: sha256(token), qrEmitidoAt: new Date(), ...extra },
      })
    ).id;
  }

  const nuevoToken = (): string => randomBytes(16).toString('base64url');

  it('sin sesión responde 401', async () => {
    const r = await get(`${baseUrl}/soporte/qr?c=acme&e=${nuevoToken()}`);
    expect(r.status).toBe(401);
  });

  it('sin TICKETS:ALTAS responde 403 aunque tenga TICKETS:LECTURA', async () => {
    const actor = await crearActor(['TICKETS:LECTURA'], 'acme');
    const token = nuevoToken();
    await crearEquipo(token);

    const r = await get(`${baseUrl}/soporte/qr?c=acme&e=${token}`, actor.accessToken);

    expect(r.status).toBe(403);
  });

  it('orden de rutas: /soporte/qr llega al handler del QR y no a :ticketId', async () => {
    // Con solo ALTAS, si Express lo matcheara como `ticketId = 'qr'` la respuesta sería 403
    // (`:ticketId` exige TICKETS:LECTURA); acá responde el handler del QR con el equipo.
    const solo = await crearActor(['TICKETS:ALTAS'], 'acme');
    const token = nuevoToken();
    const equipoId = await crearEquipo(token, { nombre: 'PC-Recepcion' });

    const r = await get(`${baseUrl}/soporte/qr?c=acme&e=${token}`, solo.accessToken);

    expect(r.status).toBe(200);
    expect(r.data).toEqual({ equipo: { id: equipoId, nombre: 'PC-Recepcion' } });
  });

  it('GET /soporte/:ticketId sigue llegando a su handler (equipo null, nunca 404)', async () => {
    const actor = await crearActor(['TICKETS:LECTURA', 'TICKETS:ALTAS'], 'acme');

    const r = await get(
      `${baseUrl}/soporte/00000000-0000-4000-8000-000000000000`,
      actor.accessToken,
    );

    expect(r.status).toBe(200);
    expect(r.data).toEqual({ equipo: null });
  });

  it('un slug que no es el de la sesión responde 404 y no revela el equipo', async () => {
    const actor = await crearActor(['TICKETS:ALTAS'], 'acme');
    const token = nuevoToken();
    await crearEquipo(token);

    const otro = await get(`${baseUrl}/soporte/qr?c=otra-org&e=${token}`, actor.accessToken);
    const sinSlug = await get(`${baseUrl}/soporte/qr?e=${token}`, actor.accessToken);

    expect(otro.status).toBe(404);
    expect(sinSlug.status).toBe(404);
    expect(JSON.stringify(otro.data)).not.toContain('PC-QR');
  });

  it('el token de un equipo dado de baja, uno inexistente o ausente da equipo null', async () => {
    const actor = await crearActor(['TICKETS:ALTAS'], 'acme');
    const tokenBaja = nuevoToken();
    await crearEquipo(tokenBaja, { activo: false });

    const baja = await get(`${baseUrl}/soporte/qr?c=acme&e=${tokenBaja}`, actor.accessToken);
    const inexistente = await get(
      `${baseUrl}/soporte/qr?c=acme&e=${nuevoToken()}`,
      actor.accessToken,
    );
    const ausente = await get(`${baseUrl}/soporte/qr?c=acme`, actor.accessToken);

    for (const r of [baja, inexistente, ausente]) {
      expect(r.status).toBe(200);
      expect(r.data).toEqual({ equipo: null });
    }
  });
});
