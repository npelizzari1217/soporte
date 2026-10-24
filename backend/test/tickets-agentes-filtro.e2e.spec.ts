/**
 * tickets-agentes-filtro.e2e.spec.ts — `GET /tickets/agentes`, las opciones del filtro "Asignado"
 * del listado de tickets.
 *
 * App real (Nest, guards reales, repositorios Prisma), master de test y una base de tenant efímera
 * migrada y sembrada. Prueba de punta a punta que la lista trae solo a TECNICO y COLABORADOR con
 * `LECTURA` sobre alguno de los tipos que el actor ve, que `?tipo=` la acota a ese tipo, y que la
 * ruta no la captura `GET /tickets/:id` (va declarada antes). Los fixtures contienen a quien NO
 * tiene que aparecer: un USUARIO con `LECTURA` sobre un tipo visible, un técnico sin permisos y un
 * técnico de un tipo que el actor no ve.
 *
 * Higiene: filas del tenant → `app.close()` → pool → `dropDatabase`, con el turno exclusivo de
 * `usarLockMasterTest()` sobre la master compartida.
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
import { TicketsModule } from '../src/tickets/tickets.module';
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
import { ClienteEntity } from '../src/clientes/domain/entities/cliente.entity';
import { UsuarioEntity } from '../src/auth/domain/entities/usuario.entity';
import { Argon2HashProvider } from '../src/auth/infrastructure/argon2-hash.provider';
import { AccionTipoTicket } from '../src/tickets/domain/permisos-tipo-ticket';
import { URL_MASTER_TEST_POR_DEFECTO, usarLockMasterTest } from '../src/testing/lock-master-test';

const MASTER_TEST_URL = process.env.DATABASE_URL_MASTER ?? URL_MASTER_TEST_POR_DEFECTO;
const TENANT_DB_NAME = `soporte_prov_agentesE2E_${randomBytes(4).toString('hex')}_test`;
const PASSWORD = 'E2eAgentesFiltro!123';

@Module({ imports: [SharedModule, AuthModule, TicketsModule] })
class HarnessModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantScopeMiddleware).forRoutes('*');
  }
}

async function httpGet<T = unknown>(
  url: string,
  token: string,
): Promise<{ status: number; data: T }> {
  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
  });
  const data = (await res.json().catch(() => null)) as T;
  return { status: res.status, data };
}

// Turno exclusivo sobre la master de test compartida — ver src/testing/lock-master-test.ts.
usarLockMasterTest();

describe('GET /tickets/agentes — opciones del filtro "Asignado" (e2e)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let prismaService: PrismaService;
  let master: InstanceType<typeof MasterPrismaClient>;
  let tenant: InstanceType<typeof TenantPrismaClient>;
  const admin = new PostgresAdminService(MASTER_TEST_URL);
  const hash = new Argon2HashProvider();

  /** Tipos del tenant: el actor ve `soporte` y `redes`, no `electricidad`. */
  const tipos = { soporte: '', redes: '', electricidad: '' };
  /** Ids de los usuarios del fixture. */
  const ids: Record<string, string> = {};
  /** Tokens de los actores del fixture. */
  const tokens: Record<string, string> = {};

  beforeAll(async () => {
    if (!process.env.DATABASE_URL_MASTER) {
      process.env.DATABASE_URL_MASTER = MASTER_TEST_URL;
    }
    await admin.createDatabase(TENANT_DB_NAME);
    await new TenantMigrationRunnerAdapter(MASTER_TEST_URL).run(TENANT_DB_NAME);
    await new TenantSeederAdapter(MASTER_TEST_URL).seed(TENANT_DB_NAME);
    prismaService = new PrismaService(MASTER_TEST_URL);
    master = prismaService.getMasterClient();
    tenant = prismaService.getTenantClient(TENANT_DB_NAME);

    await master.$executeRawUnsafe(
      'TRUNCATE TABLE membresias, refresh_tokens, usuario_cliente_permisos, usuarios, clientes, roles RESTART IDENTITY CASCADE',
    );

    const sufijo = randomBytes(3).toString('hex');
    for (const [clave, modulo] of [
      ['soporte', 'TICKETS'],
      ['redes', 'TICKETS'],
      ['electricidad', 'EDILICIA'],
    ] as const) {
      const tipo = await tenant.tipoTicket.create({
        data: { codigo: `E2E_${clave.toUpperCase()}_${sufijo}`, nombre: `E2E ${clave}`, modulo },
      });
      tipos[clave] = tipo.id;
    }

    const cliente = ClienteEntity.create({
      nombre: `E2E Agentes ${sufijo}`,
      razonSocial: null,
      cuit: null,
      dbName: TENANT_DB_NAME,
      activo: true,
    });
    await new PrismaClienteRepository(prismaService).save(cliente);

    const roles = new Map<string, string>();
    for (const codigo of ['TECNICO', 'COLABORADOR', 'USUARIO']) {
      const rol = await master.role.create({ data: { codigo, nombre: codigo } });
      roles.set(codigo, rol.id);
    }
    const usuarioRepo = new PrismaUsuarioRepository(prismaService);

    async function crear(
      clave: string,
      rol: string,
      permisos: ReadonlyArray<readonly [keyof typeof tipos, readonly AccionTipoTicket[]]>,
    ): Promise<void> {
      const rolId = roles.get(rol);
      if (rolId === undefined) throw new Error(`Rol de fixture inexistente: ${rol}`);
      const usuario = UsuarioEntity.create({
        email: `e2e_agentes_${clave}_${sufijo}@test.local`,
        nombre: clave,
        apellido: 'E2E',
        passwordHash: await hash.hash(PASSWORD),
        activo: true,
        isGlobalAdmin: false,
      });
      await usuarioRepo.save(usuario);
      await master.membresia.create({
        data: { usuarioId: usuario.id, clienteId: cliente.id, rolId, activo: true },
      });
      const filas = permisos.flatMap(([tipo, acciones]) =>
        acciones.map((accion) => ({ usuarioId: usuario.id, tipoId: tipos[tipo], accion })),
      );
      if (filas.length > 0) await tenant.permisoTipoTicket.createMany({ data: filas });
      ids[clave] = usuario.id;
    }

    // Actores: el asignador ve Soporte (con ASIGNAR) y Redes; el lector solo ve Soporte.
    await crear('asignador', 'USUARIO', [
      ['soporte', ['LECTURA', 'ASIGNAR']],
      ['redes', ['LECTURA']],
    ]);
    await crear('lector', 'USUARIO', [['soporte', ['LECTURA']]]);
    // Elegibles según el tipo.
    await crear('anaSoporte', 'TECNICO', [['soporte', ['LECTURA']]]);
    await crear('betoRedes', 'COLABORADOR', [['redes', ['LECTURA']]]);
    await crear('ciroAmbos', 'TECNICO', [
      ['soporte', ['LECTURA']],
      ['redes', ['LECTURA']],
    ]);
    // No tienen que aparecer nunca para el asignador.
    await crear('caroElectricidad', 'TECNICO', [['electricidad', ['LECTURA']]]);
    await crear('uliUsuario', 'USUARIO', [['soporte', ['LECTURA']]]);
    await crear('diegoSinPermisos', 'TECNICO', []);

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [HarnessModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    await app.listen(0);
    const port = (app.getHttpServer() as { address: () => { port: number } }).address().port;
    baseUrl = `http://localhost:${port}`;

    for (const actor of ['asignador', 'lector']) {
      const res = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: `e2e_agentes_${actor}_${sufijo}@test.local`, password: PASSWORD }),
      });
      tokens[actor] = ((await res.json()) as { accessToken: string }).accessToken;
    }
  }, 120_000);

  afterAll(async () => {
    try {
      await tenant?.permisoTipoTicket.deleteMany();
    } catch (_err) {
      /* no-op */
    }
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
    await admin.dropDatabase(TENANT_DB_NAME);
  }, 60_000);

  it('sin ?tipo=: los técnicos de los tipos que el actor ve, una vez cada uno', async () => {
    const { status, data } = await httpGet<{ id: string }[]>(
      `${baseUrl}/tickets/agentes`,
      tokens.asignador,
    );

    expect(status).toBe(200);
    expect(data.map((a) => a.id).sort()).toEqual(
      [ids.anaSoporte, ids.betoRedes, ids.ciroAmbos].sort(),
    );
  });

  it('con ?tipo=: solo los técnicos de ese tipo', async () => {
    const { status, data } = await httpGet<{ id: string }[]>(
      `${baseUrl}/tickets/agentes?tipo=${tipos.redes}`,
      tokens.asignador,
    );

    expect(status).toBe(200);
    expect(data.map((a) => a.id).sort()).toEqual([ids.betoRedes, ids.ciroAmbos].sort());
  });

  it('con ?tipo= de un tipo que el actor no ve: lista vacía', async () => {
    const { status, data } = await httpGet<{ id: string }[]>(
      `${baseUrl}/tickets/agentes?tipo=${tipos.electricidad}`,
      tokens.asignador,
    );

    expect(status).toBe(200);
    expect(data).toEqual([]);
  });

  it('?tipo= que no es un UUID → 400', async () => {
    const { status } = await httpGet(`${baseUrl}/tickets/agentes?tipo=no-es-uuid`, tokens.asignador);

    expect(status).toBe(400);
  });

  it('actor solo con LECTURA (sin ASIGNAR ni VER_TODOS) → 403', async () => {
    const { status } = await httpGet(`${baseUrl}/tickets/agentes`, tokens.lector);

    expect(status).toBe(403);
  });

  it('sanity: DATABASE_URL_MASTER apunta a una DB *_test y el tenant es efímero *_test', () => {
    expect(MASTER_TEST_URL).toMatch(/_test$/);
    expect(TENANT_DB_NAME).toMatch(/^soporte_prov_agentesE2E_.*_test$/);
  });
});
