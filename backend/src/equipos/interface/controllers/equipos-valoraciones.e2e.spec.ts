/**
 * equipos-valoraciones.e2e.spec.ts — odd/tasks/historial-valor-residual.md (S2, S3, S5).
 *
 * App real contra Postgres real: el alta y la edición por HTTP registran el historial del valor con
 * el actor del JWT, y `GET /equipos/:id/valoraciones` lo devuelve ordenado, con el nombre del
 * usuario, también para un equipo dado de baja. Sin `EQUIPOS:LECTURA` contesta 403. Mismo patrón
 * que `equipos-incluir-bajas.e2e.spec.ts`: tenant efímero, `soporte_master_test` truncada en
 * `beforeEach` y `usarLockMasterTest()`.
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

const TENANT_DB_NAME = `soporte_prov_valoracionesE2E_${randomBytes(4).toString('hex')}_test`;
const PLAINTEXT_PASSWORD = 'E2eValoracionesSecret!123';

type Headers = Record<string, string>;
type Respuesta<T> = { status: number; data: T };

interface ValoracionHttp {
  fecha: string;
  importe: number;
  origen: string;
  usuarioId: string | null;
  usuarioNombre: string | null;
  usuarioApellido: string | null;
}

async function http<T>(
  method: 'GET' | 'POST' | 'PATCH',
  url: string,
  headers: Headers,
  body?: unknown,
): Promise<Respuesta<T>> {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const texto = await res.text();
  return { status: res.status, data: (texto ? JSON.parse(texto) : null) as T };
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

describe('Equipos e2e — historial del valor (historial-valor-residual)', () => {
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

  async function limpiarFilas(): Promise<void> {
    await tenantClient.valoracionEquipo.deleteMany();
    await tenantClient.equipoInformatico.deleteMany();
  }

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
    // Orden CRITICO: filas -> app.close() -> dropDatabase. Al revés, el DROP falla en silencio.
    try {
      await limpiarFilas();
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

  let cliente: ClienteEntity;

  beforeEach(async () => {
    await masterClient.$executeRawUnsafe(
      'TRUNCATE TABLE membresias, refresh_tokens, usuario_cliente_permisos, usuarios, clientes, roles RESTART IDENTITY CASCADE',
    );
    await limpiarFilas();
    cliente = ClienteEntity.create({
      nombre: `E2E Valoraciones ${randomBytes(3).toString('hex')}`,
      razonSocial: null,
      cuit: null,
      dbName: TENANT_DB_NAME,
      activo: true,
    });
    await clienteRepo.save(cliente);
  });

  // ─── Fixtures (master) ──────────────────────────────────────────────────

  /** Actor del cliente con exactamente las celdas pedidas (rol distinto de ADMINISTRADOR). */
  async function crearActor(
    nombre: string,
    apellido: string,
    permisos: string[],
  ): Promise<{ token: string; usuarioId: string }> {
    const role = RoleEntity.create({
      codigo: `ROL_E2E_${randomBytes(3).toString('hex')}`,
      nombre: 'Rol E2E',
      descripcion: null,
      permisos: [],
    });
    await masterClient.role.create({
      data: { id: role.id, codigo: role.codigo, nombre: role.nombre },
    });
    const usuario = UsuarioEntity.create({
      email: `e2e_valoraciones_${randomBytes(3).toString('hex')}@test.local`,
      nombre,
      apellido,
      passwordHash: await hashProvider.hash(PLAINTEXT_PASSWORD),
      activo: true,
      isGlobalAdmin: false,
    });
    await usuarioRepo.save(usuario);
    await masterClient.membresia.create({
      data: { usuarioId: usuario.id, clienteId: cliente.id, rolId: role.id, activo: true },
    });
    await permisosRepo.setPermisos(usuario.id, cliente.id, permisos);
    const { data } = await http<{ accessToken: string }>(
      'POST',
      `${baseUrl}/auth/login`,
      {},
      {
        email: usuario.email,
        password: PLAINTEXT_PASSWORD,
      },
    );
    return { token: data.accessToken, usuarioId: usuario.id };
  }

  const TODOS = ['EQUIPOS:LECTURA', 'EQUIPOS:ALTAS', 'EQUIPOS:MODIFICACION', 'EQUIPOS:BORRADO'];

  const historial = (equipoId: string, token: string) =>
    http<ValoracionHttp[]>('GET', `${baseUrl}/equipos/${equipoId}/valoraciones`, bearer(token));

  it('alta y ediciones registran el historial con el actor; GET lo devuelve por fecha', async () => {
    const ana = await crearActor('Ana', 'Pérez', TODOS);
    const beto = await crearActor('Beto', 'Gómez', TODOS);

    const alta = await http<{ id: string }>('POST', `${baseUrl}/equipos`, bearer(ana.token), {
      nombre: 'Notebook historial',
      importe: 1000,
      fechaValoracion: '2026-01-10',
      valorResidual: 700,
      fechaValorResidual: '2026-06-01',
    });
    expect(alta.status).toBe(201);
    const equipoId = alta.data.id;

    // Edición con un valor nuevo en otra fecha: fila nueva, de Beto.
    const edicion = await http('PATCH', `${baseUrl}/equipos/${equipoId}`, bearer(beto.token), {
      valorResidual: 490,
      fechaValorResidual: '2026-10-24',
    });
    expect(edicion.status).toBe(200);
    // Mismo día, otro monto: reemplaza la fila del día (S3), ahora de Ana.
    await http('PATCH', `${baseUrl}/equipos/${equipoId}`, bearer(ana.token), {
      valorResidual: 450.5,
    });
    // Un cambio que no toca el valor residual no registra nada.
    await http('PATCH', `${baseUrl}/equipos/${equipoId}`, bearer(beto.token), {
      nombre: 'Notebook renombrada',
    });

    const res = await historial(equipoId, ana.token);

    expect(res.status).toBe(200);
    expect(res.data).toEqual([
      {
        fecha: '2026-06-01T00:00:00.000Z',
        importe: 700,
        origen: 'MANUAL',
        usuarioId: ana.usuarioId,
        usuarioNombre: 'Ana',
        usuarioApellido: 'Pérez',
      },
      {
        fecha: '2026-10-24T00:00:00.000Z',
        importe: 450.5,
        origen: 'MANUAL',
        usuarioId: ana.usuarioId,
        usuarioNombre: 'Ana',
        usuarioApellido: 'Pérez',
      },
    ]);
  });

  it('un equipo dado de baja sigue mostrando su historial', async () => {
    const ana = await crearActor('Ana', 'Pérez', TODOS);
    const alta = await http<{ id: string }>('POST', `${baseUrl}/equipos`, bearer(ana.token), {
      nombre: 'Equipo a dar de baja',
      valorResidual: 300,
      fechaValorResidual: '2026-09-09',
    });
    const baja = await http('POST', `${baseUrl}/equipos/${alta.data.id}/baja`, bearer(ana.token), {
      destino: 'DESCARTE',
      categoria: 'VEJEZ',
    });
    expect(baja.status).toBe(200);

    const res = await historial(alta.data.id, ana.token);

    expect(res.status).toBe(200);
    expect(res.data.map((v) => [v.fecha, v.importe])).toEqual([['2026-09-09T00:00:00.000Z', 300]]);
  });

  it('sin EQUIPOS:LECTURA contesta 403 y no expone el historial', async () => {
    const ana = await crearActor('Ana', 'Pérez', TODOS);
    const sinLectura = await crearActor('Sin', 'Lectura', [
      'EQUIPOS:ALTAS',
      'EQUIPOS:MODIFICACION',
      'EQUIPOS:BORRADO',
    ]);
    const alta = await http<{ id: string }>('POST', `${baseUrl}/equipos`, bearer(ana.token), {
      nombre: 'Equipo reservado',
      valorResidual: 300,
      fechaValorResidual: '2026-09-09',
    });

    const res = await http<unknown>(
      'GET',
      `${baseUrl}/equipos/${alta.data.id}/valoraciones`,
      bearer(sinLectura.token),
    );

    expect(res.status).toBe(403);
    expect(JSON.stringify(res.data)).not.toContain('2026-09-09');
  });

  it('un equipo inexistente contesta 404', async () => {
    const ana = await crearActor('Ana', 'Pérez', TODOS);

    const res = await historial('01900000-0000-7000-8000-00000000ffff', ana.token);

    expect(res.status).toBe(404);
  });
});
