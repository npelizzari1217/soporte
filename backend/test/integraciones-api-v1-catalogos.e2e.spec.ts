/**
 * integraciones-api-v1-catalogos.e2e.spec.ts — e2e HTTP real de `GET /v1/catalogos` de la API publica
 * (api-publica, T5c): forma del contrato, catalogos dados de baja excluidos, permiso de lectura y
 * aislamiento entre clientes. Postgres real: `soporte_master_test` y una base de tenant efimera por
 * cliente (A y B).
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
import { ApiV1Module } from '../src/integraciones/api-v1.module';
import { PrismaService } from '../src/shared/infrastructure/persistence/prisma.service';
import {
  MasterPrismaClient,
  TenantPrismaClient,
} from '../src/shared/infrastructure/persistence/prisma-clients';
import { TenantScopeMiddleware } from '../src/shared/tenancy/tenant-scope.middleware';
import { PostgresAdminService } from '../src/clientes/infrastructure/postgres-admin.service';
import { TenantMigrationRunnerAdapter } from '../src/clientes/infrastructure/tenant-migration-runner.adapter';
import { TenantSeederAdapter } from '../src/clientes/infrastructure/tenant-seeder.adapter';
import { generarClaveApi } from '../src/integraciones/domain/generar-clave-api';
import { usarLockMasterTest } from '../src/testing/lock-master-test';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const SUFIJO = randomBytes(4).toString('hex');
const DB_A = `soporte_prov_v1catA_${SUFIJO}_test`;
const DB_B = `soporte_prov_v1catB_${SUFIJO}_test`;
/** Prefijo de los tipos que crea este spec; el barrido de cada test los borra. */
const PREFIJO_TIPO = 'E2E_V1CAT_';

// Turno exclusivo sobre la master de test compartida — ver src/testing/lock-master-test.ts.
usarLockMasterTest();

@Module({ imports: [SharedModule, AuthModule, TicketsModule, ApiV1Module] })
class ArneesModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantScopeMiddleware).forRoutes('*');
  }
}

interface Entorno {
  clienteId: string;
  usuarioId: string;
  adminId: string;
  tenant: InstanceType<typeof TenantPrismaClient>;
}

interface ItemCatalogo {
  id: string;
  codigo: string;
  nombre: string;
  orden?: number;
}

interface CatalogosResp {
  tipos: ItemCatalogo[];
  prioridades: ItemCatalogo[];
  estados: ItemCatalogo[];
}

describe('API v1 e2e — catalogos', () => {
  let app: INestApplication;
  let baseUrl: string;
  let prismaService: PrismaService;
  let master: InstanceType<typeof MasterPrismaClient>;
  const admin = new PostgresAdminService(MASTER_TEST_URL);

  /** Deja el catalogo del tenant como lo siembra el provisioning. */
  async function restaurarCatalogo(db: string): Promise<void> {
    const t = prismaService.getTenantClient(db);
    await t.tipoTicket.deleteMany({ where: { codigo: { startsWith: PREFIJO_TIPO } } });
    await t.prioridad.updateMany({ data: { activo: true, deletedAt: null } });
  }

  beforeAll(async () => {
    if (!process.env.DATABASE_URL_MASTER) {
      process.env.DATABASE_URL_MASTER = MASTER_TEST_URL;
    }
    for (const db of [DB_A, DB_B]) {
      await admin.createDatabase(db);
      await new TenantMigrationRunnerAdapter(MASTER_TEST_URL).run(db);
      await new TenantSeederAdapter(MASTER_TEST_URL).seed(db);
    }
    prismaService = new PrismaService(MASTER_TEST_URL);
    master = prismaService.getMasterClient();

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [ArneesModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    await app.listen(0);
    const port = (app.getHttpServer() as { address: () => { port: number } }).address().port;
    baseUrl = `http://localhost:${port}`;
  }, 120_000);

  afterAll(async () => {
    // Orden: filas del tenant -> app.close() -> pool -> dropDatabase.
    for (const db of [DB_A, DB_B]) {
      try {
        await restaurarCatalogo(db);
      } catch (_err) {
        /* no-op */
      }
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
    await admin.dropDatabase(DB_A);
    await admin.dropDatabase(DB_B);
  }, 60_000);

  beforeEach(async () => {
    for (const db of [DB_A, DB_B]) {
      await restaurarCatalogo(db);
    }
    await master.$executeRawUnsafe(
      'TRUNCATE TABLE api_claves, membresias, usuarios, clientes, roles RESTART IDENTITY CASCADE',
    );
    await master.role.create({ data: { codigo: 'USUARIO', nombre: 'Usuario' } });
  });

  /** Cliente con su base de tenant, usuario de integracion + membresia USUARIO y un admin. */
  async function crearEntorno(dbName: string): Promise<Entorno> {
    const sufijo = randomBytes(3).toString('hex');
    const cliente = await master.cliente.create({
      data: { nombre: `E2E v1 cat ${sufijo}`, dbName, apiHabilitada: true },
    });
    const usuario = await master.usuario.create({
      data: {
        email: `integracion-${sufijo}@integraciones.invalid`,
        nombre: 'Integracion',
        apellido: 'API',
        passwordHash: 'x',
        esIntegracion: true,
      },
    });
    const rol = await master.role.findUniqueOrThrow({ where: { codigo: 'USUARIO' } });
    await master.membresia.create({
      data: { usuarioId: usuario.id, clienteId: cliente.id, rolId: rol.id },
    });
    const adminUsuario = await master.usuario.create({
      data: {
        email: `admin-${sufijo}@e2e.test`,
        nombre: 'Admin',
        apellido: 'E2E',
        passwordHash: 'x',
      },
    });
    return {
      clienteId: cliente.id,
      usuarioId: usuario.id,
      adminId: adminUsuario.id,
      tenant: prismaService.getTenantClient(dbName),
    };
  }

  async function emitirClave(e: Entorno, permisos: string[]): Promise<string> {
    const generada = generarClaveApi();
    await master.apiClave.create({
      data: {
        clienteId: e.clienteId,
        usuarioId: e.usuarioId,
        nombre: 'ERP',
        prefijo: generada.prefijo,
        hash: generada.hash,
        permisos,
        creadaPorId: e.adminId,
      },
    });
    return generada.clave;
  }

  async function catalogos(clave?: string): Promise<{ status: number; data: CatalogosResp }> {
    const res = await fetch(`${baseUrl}/v1/catalogos`, {
      headers: clave === undefined ? {} : { 'X-Api-Key': clave },
    });
    return { status: res.status, data: (await res.json().catch(() => null)) as CatalogosResp };
  }

  it('200: tipos del modulo TICKETS y prioridades activas, todos los estados, sin campos internos', async () => {
    const a = await crearEntorno(DB_A);
    const clave = await emitirClave(a, ['TICKETS:LECTURA']);
    await a.tenant.tipoTicket.create({
      data: {
        codigo: `${PREFIJO_TIPO}BAJA`,
        nombre: 'Tipo dado de baja',
        modulo: 'TICKETS',
        activo: false,
        deletedAt: new Date(),
      },
    });
    const baja = await a.tenant.prioridad.update({
      where: { codigo: 'BAJA' },
      data: { activo: false, deletedAt: new Date() },
    });

    const res = await catalogos(clave);

    expect(res.status).toBe(200);
    expect(Object.keys(res.data).sort()).toEqual(['estados', 'prioridades', 'tipos']);

    const tiposTickets = await a.tenant.tipoTicket.findMany({
      where: { modulo: 'TICKETS', deletedAt: null },
    });
    expect(res.data.tipos.map((t) => t.id).sort()).toEqual(tiposTickets.map((t) => t.id).sort());
    expect(res.data.tipos.map((t) => t.codigo)).toContain('SOPORTE');
    expect(res.data.tipos.map((t) => t.codigo)).not.toContain('EDILICIA');
    expect(res.data.tipos.map((t) => t.codigo)).not.toContain(`${PREFIJO_TIPO}BAJA`);
    for (const t of res.data.tipos) {
      expect(Object.keys(t).sort()).toEqual(['codigo', 'id', 'nombre']);
    }

    expect(res.data.prioridades.map((p) => p.codigo)).toEqual(['MEDIA', 'ALTA', 'CRITICA']);
    expect(res.data.prioridades.map((p) => p.id)).not.toContain(baja.id);
    for (const p of res.data.prioridades) {
      expect(Object.keys(p).sort()).toEqual(['codigo', 'id', 'nombre', 'orden']);
    }

    const estados = await a.tenant.estado.findMany({ orderBy: { orden: 'asc' } });
    expect(res.data.estados).toEqual(
      estados.map((e) => ({ id: e.id, codigo: e.codigo, nombre: e.nombre, orden: e.orden })),
    );
  });

  it('los ids publicados sirven para crear un ticket', async () => {
    const a = await crearEntorno(DB_A);
    const clave = await emitirClave(a, ['TICKETS:LECTURA', 'TICKETS:ALTAS']);
    await a.tenant.cicloCliente.create({
      data: {
        cicloVigenteId: '01900000-0000-7000-8000-000000000001',
        nombre: 'E2E ciclo v1 cat',
        fechaInicio: new Date('2026-01-01'),
        fechaFin: new Date('2026-12-31'),
        activo: true,
      },
    });
    try {
      const { data } = await catalogos(clave);
      const res = await fetch(`${baseUrl}/v1/tickets`, {
        method: 'POST',
        headers: { 'X-Api-Key': clave, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titulo: 'Desde el catalogo',
          tipoId: data.tipos[0].id,
          prioridadId: data.prioridades[0].id,
        }),
      });
      const ticket = (await res.json()) as { estadoId: string };

      expect(res.status).toBe(201);
      expect(data.estados.map((e) => e.id)).toContain(ticket.estadoId);
    } finally {
      await a.tenant.operacionTicket.deleteMany();
      await a.tenant.ticket.deleteMany();
      await a.tenant.cicloCliente.deleteMany();
    }
  });

  it('401 sin clave y con una clave inexistente', async () => {
    expect((await catalogos()).status).toBe(401);
    expect((await catalogos(generarClaveApi().clave)).status).toBe(401);
  });

  it('403 para una clave sin TICKETS:LECTURA', async () => {
    const a = await crearEntorno(DB_A);
    const clave = await emitirClave(a, ['TICKETS:ALTAS', 'TICKETS:COMENTAR']);

    expect((await catalogos(clave)).status).toBe(403);
  });

  it('una clave del cliente A no ve el catalogo del cliente B', async () => {
    const a = await crearEntorno(DB_A);
    const b = await crearEntorno(DB_B);
    const claveA = await emitirClave(a, ['TICKETS:LECTURA']);
    const deB = await b.tenant.tipoTicket.create({
      data: { codigo: `${PREFIJO_TIPO}SOLO_B`, nombre: 'Solo de B', modulo: 'TICKETS' },
    });

    const res = await catalogos(claveA);

    expect(res.status).toBe(200);
    const ids = [...res.data.tipos, ...res.data.prioridades, ...res.data.estados].map((i) => i.id);
    const tiposA = await a.tenant.tipoTicket.findMany({ select: { id: true } });
    const prioridadesA = await a.tenant.prioridad.findMany({ select: { id: true } });
    const estadosA = await a.tenant.estado.findMany({ select: { id: true } });
    const idsA = new Set([...tiposA, ...prioridadesA, ...estadosA].map((r) => r.id));
    expect(ids.every((id) => idsA.has(id))).toBe(true);
    expect(ids).not.toContain(deB.id);
    expect(res.data.tipos.map((t) => t.codigo)).not.toContain(`${PREFIJO_TIPO}SOLO_B`);
  });
});
