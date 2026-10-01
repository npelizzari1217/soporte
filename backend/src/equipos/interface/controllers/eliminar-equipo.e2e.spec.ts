/**
 * eliminar-equipo.e2e.spec.ts — WU-3 (baja-equipo-completo, R13), corrección de defecto.
 *
 * App real contra Postgres real: `DELETE /equipos/:id` rechaza con 422 un equipo con piezas
 * activas (informa la cantidad) o dado de baja, y borra el que no tiene piezas. Mismo patrón que
 * `equipos-retirar-componente.e2e.spec.ts`: tenant efímero, `soporte_master_test` truncada en
 * `beforeEach` y `usarLockMasterTest()`. Un solo actor por test.
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

const TENANT_DB_NAME = `soporte_prov_eliminarEquipoE2E_${randomBytes(4).toString('hex')}_test`;
const PLAINTEXT_PASSWORD = 'E2eEliminarEquipoSecret!123';

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

async function httpGet(url: string, headers: Headers = {}): Promise<{ status: number }> {
  const res = await fetch(url, { headers });
  return { status: res.status };
}

async function httpDelete(
  url: string,
  headers: Headers = {},
): Promise<{ status: number; data: { message?: string } | null }> {
  const res = await fetch(url, { method: 'DELETE', headers });
  const data = (await res.json().catch(() => null)) as { message?: string } | null;
  return { status: res.status, data };
}

function bearer(token: string): Headers {
  return { Authorization: `Bearer ${token}` };
}

@Module({ imports: [SharedModule, AuthModule, EquiposModule] })
class TestHarnessModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantScopeMiddleware).forRoutes('*');
  }
}

usarLockMasterTest();

describe('Equipos e2e — DELETE /equipos/:id (WU-3, R13)', () => {
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
  const RUN_PREFIX = randomBytes(3).toString('hex').toUpperCase();

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
    // Orden CRÍTICO (bug real documentado en compras.e2e.spec.ts): app.close()
    // SIEMPRE antes de dropDatabase.
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
      nombre: `E2E Eliminar Equipo ${randomBytes(3).toString('hex')}`,
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

  async function createUsuario(suffix: string, isGlobalAdmin = false): Promise<UsuarioEntity> {
    const usuario = UsuarioEntity.create({
      email: `e2e_eliminar_equipo_${suffix}@test.local`,
      nombre: 'E2E',
      apellido: 'EliminarEquipo',
      passwordHash: await hashProvider.hash(PLAINTEXT_PASSWORD),
      activo: true,
      isGlobalAdmin,
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
   * Actor con exactamente las celdas pedidas — mismo criterio que
   * `compras.e2e.spec.ts`: rol con código DISTINTO de 'ADMINISTRADOR' para
   * que `resolverScope` no le dé el catálogo completo sin importar qué se
   * sembró.
   */
  async function crearActorConPermisos(
    permisos: string[],
  ): Promise<{ accessToken: string; clienteId: string; usuarioId: string }> {
    const cliente = await crearClienteTenant();
    const role = await createRole(`ROL_E2E_${randomBytes(3).toString('hex')}`);
    const usuario = await createUsuario(randomBytes(3).toString('hex'));
    await createMembresia(usuario.id, cliente.id, role.id);
    await permisosRepo.setPermisos(usuario.id, cliente.id, permisos);
    const { accessToken } = await login(usuario.email);
    return { accessToken, clienteId: cliente.id, usuarioId: usuario.id };
  }

  async function crearInsumo(): Promise<string> {
    const familia = await tenantClient.familiaInsumo.create({
      data: { codigo: `${RUN_PREFIX}F`, nombre: 'Familia E2E', esRepuesto: true, activo: true },
    });
    const unidad = await tenantClient.unidadMedida.create({
      data: { codigo: `${RUN_PREFIX}U`, nombre: 'Unidad E2E' },
    });
    const insumo = await tenantClient.insumo.create({
      data: {
        codigo: `${RUN_PREFIX}I${randomBytes(3).toString('hex')}`,
        nombre: 'Repuesto E2E',
        familiaId: familia.id,
        unidadMedidaId: unidad.id,
        activo: true,
      },
    });
    return insumo.id;
  }

  async function crearEquipoDirecto(dadoDeBaja = false): Promise<string> {
    const equipo = await tenantClient.equipoInformatico.create({
      data: {
        nombre: `Equipo E2E ${randomBytes(3).toString('hex')}`,
        ...(dadoDeBaja && {
          activo: false,
          bajaDestino: 'DESCARTE',
          bajaCategoria: 'VEJEZ',
          bajaFecha: new Date(),
          bajaUsuarioId: '01900000-0000-7000-8000-000000000501',
        }),
      },
    });
    return equipo.id;
  }

  const equipoUrl = (id: string) => `${baseUrl}/equipos/${id}`;
  const PERMISOS = ['EQUIPOS:BORRADO', 'EQUIPOS:LECTURA'];

  it('con una pieza activa -> 422 con la cantidad y el equipo sigue visible', async () => {
    const actor = await crearActorConPermisos(PERMISOS);
    const equipoId = await crearEquipoDirecto();
    const insumoId = await crearInsumo();
    const componente = await tenantClient.componenteEquipo.create({ data: { equipoId, insumoId } });

    const { status, data } = await httpDelete(equipoUrl(equipoId), bearer(actor.accessToken));

    expect(status).toBe(422);
    expect(data?.message).toContain('1 pieza activa');
    const equipo = await tenantClient.equipoInformatico.findUniqueOrThrow({
      where: { id: equipoId },
    });
    expect(equipo.deletedAt).toBeNull();
    const fila = await tenantClient.componenteEquipo.findUniqueOrThrow({
      where: { id: componente.id },
    });
    expect(fila.deletedAt).toBeNull();
    expect((await httpGet(equipoUrl(equipoId), bearer(actor.accessToken))).status).toBe(200);
  });

  it('sobre un equipo dado de baja -> 422 y el equipo sigue visible', async () => {
    const actor = await crearActorConPermisos(PERMISOS);
    const equipoId = await crearEquipoDirecto(true);

    const { status } = await httpDelete(equipoUrl(equipoId), bearer(actor.accessToken));

    expect(status).toBe(422);
    const equipo = await tenantClient.equipoInformatico.findUniqueOrThrow({
      where: { id: equipoId },
    });
    expect(equipo.deletedAt).toBeNull();
  });

  it('sin piezas -> 204 y la ficha responde 404', async () => {
    const actor = await crearActorConPermisos(PERMISOS);
    const equipoId = await crearEquipoDirecto();

    const { status } = await httpDelete(equipoUrl(equipoId), bearer(actor.accessToken));

    expect(status).toBe(204);
    expect((await httpGet(equipoUrl(equipoId), bearer(actor.accessToken))).status).toBe(404);
  });

  it('sin EQUIPOS:BORRADO -> 403 y el equipo no se toca (regresión)', async () => {
    const actor = await crearActorConPermisos(['EQUIPOS:LECTURA']);
    const equipoId = await crearEquipoDirecto();

    const { status } = await httpDelete(equipoUrl(equipoId), bearer(actor.accessToken));

    expect(status).toBe(403);
    const equipo = await tenantClient.equipoInformatico.findUniqueOrThrow({
      where: { id: equipoId },
    });
    expect(equipo.deletedAt).toBeNull();
  });
});
