/**
 * integraciones-webhooks-encolado.e2e.spec.ts — encolado de avisos de webhook (odd/webhooks, T4)
 * con la cadena real: caso de uso de tickets -> publicador -> `WebhookEncoladoListener` -> cola en
 * la base del inquilino. Postgres real: `soporte_master_test` y una base efímera por cliente.
 *
 * Criterio transversal: dos clientes con destino activo; el evento de un ticket de A se encola
 * solo en la base de A, con los datos de A. CA1: un comentario interno no encola nada.
 */
import { randomBytes } from 'node:crypto';
import {
  INestApplication,
  MiddlewareConsumer,
  Module,
  NestModule,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { SharedModule } from '../src/shared/shared.module';
import { AuthModule } from '../src/auth/auth.module';
import { TicketsModule } from '../src/tickets/tickets.module';
import { ApiV1Module } from '../src/integraciones/api-v1.module';
import { CrearComentarioUseCase } from '../src/tickets/application/use-cases/crear-comentario.use-case';
import { PrismaService } from '../src/shared/infrastructure/persistence/prisma.service';
import {
  MasterPrismaClient,
  TenantPrismaClient,
} from '../src/shared/infrastructure/persistence/prisma-clients';
import { TenantContext } from '../src/shared/tenancy/tenant-context';
import { TenantScopeMiddleware } from '../src/shared/tenancy/tenant-scope.middleware';
import { PostgresAdminService } from '../src/clientes/infrastructure/postgres-admin.service';
import { TenantMigrationRunnerAdapter } from '../src/clientes/infrastructure/tenant-migration-runner.adapter';
import { TenantSeederAdapter } from '../src/clientes/infrastructure/tenant-seeder.adapter';
import { generarClaveApi } from '../src/integraciones/domain/generar-clave-api';
import { EVENTOS_WEBHOOK } from '../src/integraciones/domain/webhook-destino';
import { usarLockMasterTest } from '../src/testing/lock-master-test';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const SUFIJO = randomBytes(4).toString('hex');
const DB_A = `soporte_prov_whencA_${SUFIJO}_test`;
const DB_B = `soporte_prov_whencB_${SUFIJO}_test`;

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
  dbName: string;
  usuarioId: string;
  clave: string;
  tipoId: string;
  prioridadId: string;
  tenant: InstanceType<typeof TenantPrismaClient>;
}

/** Lee un campo de texto de una respuesta JSON sin castear. */
function campo(data: unknown, nombre: string): string {
  if (typeof data !== 'object' || data === null || !(nombre in data)) {
    throw new Error(`La respuesta no trae "${nombre}": ${JSON.stringify(data)}`);
  }
  return String(Reflect.get(data, nombre));
}

/** El listener corre después de responder: se espera a que la condición se cumpla. */
async function esperarHasta(condicion: () => Promise<boolean>, plazoMs = 5_000): Promise<void> {
  const limite = Date.now() + plazoMs;
  while (!(await condicion())) {
    if (Date.now() > limite) throw new Error('Se agotó la espera del encolado');
    await new Promise((resolver) => setTimeout(resolver, 50));
  }
}

describe('Webhooks e2e — encolado por eventos de ticket (odd/webhooks T4)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let prismaService: PrismaService;
  let master: InstanceType<typeof MasterPrismaClient>;
  const admin = new PostgresAdminService(MASTER_TEST_URL);

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
    for (const db of [DB_A, DB_B]) {
      await prismaService.getTenantClient(db).cicloCliente.create({
        data: {
          cicloVigenteId: '01900000-0000-7000-8000-000000000001',
          nombre: 'E2E ciclo webhooks',
          fechaInicio: new Date('2026-01-01'),
          fechaFin: new Date('2026-12-31'),
          activo: true,
        },
      });
    }

    const moduleRef = await Test.createTestingModule({ imports: [ArneesModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    await app.listen(0);
    baseUrl = (await app.getUrl()).replace('[::1]', 'localhost');
  }, 120_000);

  afterAll(async () => {
    // Orden: filas del tenant -> app.close() -> pool -> dropDatabase.
    for (const db of [DB_A, DB_B]) {
      try {
        const t = prismaService.getTenantClient(db);
        await t.webhookEntrega.deleteMany();
        await t.operacionTicket.deleteMany();
        await t.ticket.deleteMany();
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
      const t = prismaService.getTenantClient(db);
      await t.webhookEntrega.deleteMany();
      await t.operacionTicket.deleteMany();
      await t.ticket.deleteMany();
    }
    await master.$executeRawUnsafe(
      'TRUNCATE TABLE webhook_destinos, api_claves, membresias, usuarios, clientes, roles RESTART IDENTITY CASCADE',
    );
    await master.role.create({ data: { codigo: 'USUARIO', nombre: 'Usuario' } });
  });

  /** Cliente con la API habilitada, destino activo suscripto a todo y una clave de la API. */
  async function crearEntorno(dbName: string): Promise<Entorno> {
    const sufijo = randomBytes(3).toString('hex');
    const cliente = await master.cliente.create({
      data: { nombre: `E2E webhooks ${sufijo}`, dbName, apiHabilitada: true },
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
    await master.webhookDestino.create({
      data: {
        clienteId: cliente.id,
        url: `https://${sufijo}.example.com/webhooks`,
        eventos: [...EVENTOS_WEBHOOK],
        secretoCifrado: 'v1:no:se:usa',
        activo: true,
      },
    });
    const generada = generarClaveApi();
    await master.apiClave.create({
      data: {
        clienteId: cliente.id,
        usuarioId: usuario.id,
        nombre: 'ERP',
        prefijo: generada.prefijo,
        hash: generada.hash,
        permisos: ['TICKETS:LECTURA', 'TICKETS:ALTAS', 'TICKETS:COMENTAR'],
        creadaPorId: usuario.id,
      },
    });
    const tenant = prismaService.getTenantClient(dbName);
    const tipo = await tenant.tipoTicket.findUniqueOrThrow({ where: { codigo: 'SOPORTE' } });
    const prioridad = await tenant.prioridad.findUniqueOrThrow({ where: { codigo: 'MEDIA' } });
    return {
      clienteId: cliente.id,
      dbName,
      usuarioId: usuario.id,
      clave: generada.clave,
      tipoId: tipo.id,
      prioridadId: prioridad.id,
      tenant,
    };
  }

  async function llamar(e: Entorno, ruta: string, cuerpo: unknown): Promise<unknown> {
    const res = await fetch(`${baseUrl}/v1/tickets${ruta}`, {
      method: 'POST',
      headers: { 'X-Api-Key': e.clave, 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    });
    expect(res.status).toBe(201);
    const data: unknown = await res.json();
    return data;
  }

  async function crearTicket(e: Entorno): Promise<{ id: string; numero: string }> {
    const data = await llamar(e, '', {
      titulo: 'No imprime',
      descripcion: 'Descripción que no viaja en el aviso',
      tipoId: e.tipoId,
      prioridadId: e.prioridadId,
    });
    return { id: campo(data, 'id'), numero: campo(data, 'numero') };
  }

  const contar = (e: Entorno, evento: string) => e.tenant.webhookEntrega.count({ where: { evento } });

  it('el evento de un ticket de A se encola solo en la base de A, con los datos de A', async () => {
    const a = await crearEntorno(DB_A);
    const b = await crearEntorno(DB_B);

    const ticket = await crearTicket(a);
    await esperarHasta(async () => (await contar(a, 'TICKET_CREADO')) === 1);

    const entrega = await a.tenant.webhookEntrega.findFirstOrThrow({
      where: { evento: 'TICKET_CREADO' },
    });
    expect(entrega).toMatchObject({
      ticketId: ticket.id,
      estado: 'PENDIENTE',
      intentos: 0,
      payload: {
        evento: 'ticket.creado',
        ticket: { id: ticket.id, numero: ticket.numero, estado: 'NUEVO', tipo: a.tipoId },
      },
    });
    expect(entrega.proximoIntentoAt.getTime()).toBeLessThanOrEqual(Date.now());
    expect(JSON.stringify(entrega.payload)).not.toContain('Descripción');
    expect(await b.tenant.webhookEntrega.count()).toBe(0);
  });

  it('CA1: un comentario interno no encola nada; uno público sí', async () => {
    const a = await crearEntorno(DB_A);
    const ticket = await crearTicket(a);
    await esperarHasta(async () => (await contar(a, 'TICKET_CREADO')) === 1);

    const tenantContext = app.get(TenantContext);
    const comentar = app.get(CrearComentarioUseCase, { strict: false });
    const interno = await tenantContext.run(
      { prismaClient: a.tenant, dbName: a.dbName, clienteId: a.clienteId },
      () =>
        comentar.execute({
          ticketId: ticket.id,
          texto: 'Nota interna',
          autorId: a.usuarioId,
          esInterno: true,
          // Llamada directa al caso de uso, sin restricción de módulo ni de fila.
          actorId: a.usuarioId,
          tienePermisoVerTodos: true,
          modulosPermitidos: null,
        }),
    );
    expect(interno.isOk()).toBe(true);

    // El público va después: cuando su aviso aparece, el interno ya habría encolado el suyo.
    await llamar(a, `/${ticket.id}/comentarios`, { texto: 'Respuesta pública' });
    await esperarHasta(async () => (await contar(a, 'TICKET_COMENTADO')) >= 1);

    expect(await contar(a, 'TICKET_COMENTADO')).toBe(1);
    expect(await a.tenant.operacionTicket.count({ where: { esInterno: true } })).toBe(1);
  });
});
