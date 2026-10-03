/**
 * pedido-publico-confirmar.e2e.spec.ts — `POST publico/c/:slug/pedido/confirmar`
 * (sdd/formulario-publico-qr, WU-15; tarea 15.1; D1, ADR-4, ADR-7, ADR-8).
 *
 * App real contra Postgres real y guards reales (throttler, tenant): dos tenants efímeros (A y B)
 * con el catálogo mínimo y un ciclo activo, `soporte_master_test` truncada en `beforeEach`,
 * `usarLockMasterTest()` y `EMAIL_SENDER` falso. Los tokens se siembran directo en master y el
 * pendiente en el tenant (el camino de `solicitud` ya lo cubre su propio e2e). Los cupos del
 * throttler viven en memoria y se comparten entre tests: cada test usa su propio token.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
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
import { FormularioPublicoModule } from '../../formulario-publico.module';
import { TenantScopeMiddleware } from '../../../shared/tenancy/tenant-scope.middleware';
import { PrismaService } from '../../../shared/infrastructure/persistence/prisma.service';
import {
  MasterPrismaClient,
  TenantPrismaClient,
} from '../../../shared/infrastructure/persistence/prisma-clients';
import { PostgresAdminService } from '../../../clientes/infrastructure/postgres-admin.service';
import { TenantMigrationRunnerAdapter } from '../../../clientes/infrastructure/tenant-migration-runner.adapter';
import { PrismaClienteRepository } from '../../../clientes/infrastructure/persistence/prisma/prisma-cliente.repository';
import { ClienteEntity } from '../../../clientes/domain/entities/cliente.entity';
import {
  EMAIL_SENDER,
  EmailMessage,
  IEmailSender,
} from '../../../shared/domain/ports/i-email-sender';
import { TAREAS_SEGUNDO_PLANO } from '../../../shared/domain/ports/i-tareas-segundo-plano.port';
// Tipo CONCRETO: `esperarPendientes()` no está en el puerto.
import { TareasSegundoPlano } from '../../../shared/infrastructure/segundo-plano/tareas-segundo-plano';
import { usarLockMasterTest } from '../../../testing/lock-master-test';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const sufijo = randomBytes(4).toString('hex');
const DB_A = `soporte_prov_confPubA_${sufijo}_test`;
const DB_B = `soporte_prov_confPubB_${sufijo}_test`;

class FakeEmailSender implements IEmailSender {
  enviados: EmailMessage[] = [];
  async send(msg: EmailMessage): Promise<void> {
    this.enviados.push(msg);
  }
}

interface Respuesta {
  status: number;
  texto: string;
}

const sha256 = (valor: string): string => createHash('sha256').update(valor).digest('hex');

@Module({ imports: [SharedModule, AuthModule, FormularioPublicoModule] })
class TestHarnessModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantScopeMiddleware).forRoutes('*');
  }
}

usarLockMasterTest();

describe('Formulario público e2e — POST confirmar (WU-15)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let prismaService: PrismaService;
  let masterClient: InstanceType<typeof MasterPrismaClient>;
  let tenantA: InstanceType<typeof TenantPrismaClient>;
  let tenantB: InstanceType<typeof TenantPrismaClient>;
  let clienteRepo: PrismaClienteRepository;
  let tareas: TareasSegundoPlano;
  const correo = new FakeEmailSender();
  const admin = new PostgresAdminService(MASTER_TEST_URL);

  async function limpiarTenant(tenant: InstanceType<typeof TenantPrismaClient>): Promise<void> {
    await tenant.ticketSoporte.deleteMany();
    await tenant.operacionTicket.deleteMany();
    await tenant.ticket.deleteMany();
    await tenant.solicitanteExterno.deleteMany();
    await tenant.pedidoPublicoPendiente.deleteMany();
  }

  async function sembrarCatalogo(tenant: InstanceType<typeof TenantPrismaClient>): Promise<void> {
    await tenant.tipoTicket.create({
      data: { codigo: 'SOPORTE', nombre: 'Soporte', modulo: 'TICKETS' },
    });
    await tenant.estado.create({ data: { codigo: 'NUEVO', nombre: 'Nuevo' } });
    await tenant.tipoOperacion.create({ data: { codigo: 'CAMBIO_ESTADO', nombre: 'Cambio' } });
    await tenant.prioridad.create({ data: { codigo: 'MEDIA', nombre: 'Media' } });
  }

  const crearCiclo = (tenant: InstanceType<typeof TenantPrismaClient>) =>
    tenant.cicloCliente.create({
      data: {
        cicloVigenteId: randomUUID(),
        nombre: 'Ciclo e2e',
        fechaInicio: new Date('2020-01-01'),
        fechaFin: new Date('2099-12-31'),
        activo: true,
      },
    });

  beforeAll(async () => {
    if (!process.env.DATABASE_URL_MASTER) {
      process.env.DATABASE_URL_MASTER = MASTER_TEST_URL;
    }
    for (const db of [DB_A, DB_B]) {
      await admin.createDatabase(db);
      await new TenantMigrationRunnerAdapter(MASTER_TEST_URL).run(db);
    }

    prismaService = new PrismaService(MASTER_TEST_URL);
    masterClient = prismaService.getMasterClient();
    tenantA = prismaService.getTenantClient(DB_A);
    tenantB = prismaService.getTenantClient(DB_B);
    clienteRepo = new PrismaClienteRepository(prismaService);
    await sembrarCatalogo(tenantA);
    await sembrarCatalogo(tenantB);

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [TestHarnessModule],
    })
      .overrideProvider(EMAIL_SENDER)
      .useValue(correo)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    await app.listen(0);
    tareas = moduleRef.get<TareasSegundoPlano>(TAREAS_SEGUNDO_PLANO, { strict: false });
    const port = (app.getHttpServer() as { address: () => { port: number } }).address().port;
    baseUrl = `http://localhost:${port}`;
  }, 90_000);

  afterAll(async () => {
    // Orden CRÍTICO: filas → app.close() → dropDatabase. Al revés, el DROP falla en silencio.
    for (const tenant of [tenantA, tenantB]) {
      try {
        await limpiarTenant(tenant);
        await tenant.cicloCliente.deleteMany();
      } catch {
        /* no-op */
      }
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
    await admin.dropDatabase(DB_A);
    await admin.dropDatabase(DB_B);
  }, 60_000);

  beforeEach(async () => {
    await masterClient.$executeRawUnsafe('TRUNCATE TABLE clientes RESTART IDENTITY CASCADE');
    for (const tenant of [tenantA, tenantB]) {
      await limpiarTenant(tenant);
      await tenant.cicloCliente.deleteMany();
      await crearCiclo(tenant);
    }
    correo.enviados = [];
  });

  async function crearCliente(opciones: {
    slug: string;
    dbName: string;
    activo?: boolean;
  }): Promise<string> {
    const cliente = ClienteEntity.create({
      nombre: `Colegio ${opciones.slug}`,
      razonSocial: null,
      cuit: null,
      dbName: opciones.dbName,
      activo: opciones.activo ?? true,
    });
    await clienteRepo.save(cliente);
    // `save()` no escribe el slug (solo los CAS lo hacen): se carga por el camino real.
    await clienteRepo.cambiarSlugSiNoCongelado(cliente.id, opciones.slug);
    await masterClient.cliente.update({
      where: { id: cliente.id },
      data: {
        formularioPublicoHabilitado: true,
        smtpHost: 'smtp.integration.test',
        smtpPort: 587,
        smtpUser: 'pedido@integration.test',
        smtpFrom: 'no-reply@integration.test',
        smtpPasswordCifrada: 'v1:fake:fake:fake',
      },
    });
    return cliente.id;
  }

  /** Siembra un pedido pendiente en el tenant y su token en master; devuelve el token crudo. */
  async function sembrarPedido(
    clienteId: string,
    tenant: InstanceType<typeof TenantPrismaClient>,
    opciones: { vencido?: boolean; email?: string } = {},
  ): Promise<string> {
    const crudo = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + (opciones.vencido ? -60_000 : 3_600_000));
    const pendiente = await tenant.pedidoPublicoPendiente.create({
      data: {
        nombre: 'Ana <b>Pérez</b>',
        email: opciones.email ?? 'ana@example.com',
        titulo: 'No enciende la PC',
        descripcion: 'La PC del laboratorio no enciende.',
        expiresAt,
      },
    });
    await masterClient.pedidoPublicoToken.create({
      data: { id: pendiente.id, clienteId, tokenHash: sha256(crudo), expiresAt },
    });
    return crudo;
  }

  async function confirmar(
    slug: string,
    body: Record<string, unknown>,
    xff = randomBytes(6).toString('hex'),
  ): Promise<Respuesta> {
    const res = await fetch(`${baseUrl}/publico/c/${slug}/pedido/confirmar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'x-forwarded-for': xff,
      },
      body: JSON.stringify(body),
    });
    return { status: res.status, texto: await res.text() };
  }

  describe('camino feliz (D1, ADR-4)', () => {
    it('crea el ticket en el tenant del slug aunque el body traiga un clienteId ajeno, y manda el mail con el número', async () => {
      const clienteA = await crearCliente({ slug: 'conf-a', dbName: DB_A });
      const clienteB = await crearCliente({ slug: 'conf-b', dbName: DB_B });
      const token = await sembrarPedido(clienteA, tenantA);

      const r = await confirmar('conf-a', { token, clienteId: clienteB, dbName: DB_B });
      await tareas.esperarPendientes();

      expect(r.status).toBe(200);
      const { numero } = JSON.parse(r.texto) as { numero: string };
      expect(numero).toBeTruthy();

      const ticketsA = await tenantA.ticket.findMany({ include: { solicitanteExterno: true } });
      expect(ticketsA).toHaveLength(1);
      expect(ticketsA[0].numero).toBe(numero);
      expect(ticketsA[0].solicitanteExterno?.email).toBe('ana@example.com');
      expect(await tenantB.ticket.count()).toBe(0);
      expect(await tenantB.solicitanteExterno.count()).toBe(0);
      expect(await tenantA.pedidoPublicoPendiente.count()).toBe(0);

      const fila = await masterClient.pedidoPublicoToken.findUniqueOrThrow({
        where: { tokenHash: sha256(token) },
      });
      expect(fila.usedAt).not.toBeNull();

      expect(correo.enviados).toHaveLength(1);
      expect(correo.enviados[0].to).toBe('ana@example.com');
      expect(correo.enviados[0].text).toContain(numero);
      expect(correo.enviados[0].html).toContain(numero);
      // El nombre del anónimo va escapado en el html.
      expect(correo.enviados[0].html).not.toContain('<b>Pérez</b>');
    });

    it('un body sin token da 400 y no escribe nada', async () => {
      await crearCliente({ slug: 'conf-400', dbName: DB_A });

      const r = await confirmar('conf-400', { clienteId: 'x' });

      expect(r.status).toBe(400);
      expect(await tenantA.ticket.count()).toBe(0);
      expect(correo.enviados).toHaveLength(0);
    });

    it('sin ciclo activo da 409, no escribe y el pendiente sigue', async () => {
      const clienteId = await crearCliente({ slug: 'conf-ciclo', dbName: DB_A });
      const token = await sembrarPedido(clienteId, tenantA);
      await tenantA.cicloCliente.deleteMany();

      const r = await confirmar('conf-ciclo', { token });
      await tareas.esperarPendientes();

      expect(r.status).toBe(409);
      expect(await tenantA.ticket.count()).toBe(0);
      expect(await tenantA.pedidoPublicoPendiente.count()).toBe(1);
      expect(correo.enviados).toHaveLength(0);
    });
  });

  describe('404 uniforme', () => {
    it('token de B en el slug de A es el mismo 404 que un token inexistente y no escribe en ningún tenant', async () => {
      await crearCliente({ slug: 'conf-cruz-a', dbName: DB_A });
      const clienteB = await crearCliente({ slug: 'conf-cruz-b', dbName: DB_B });
      const tokenB = await sembrarPedido(clienteB, tenantB);

      const cruzado = await confirmar('conf-cruz-a', { token: tokenB });
      const inexistente = await confirmar('conf-cruz-a', { token: 'no-existe-cruz' });
      await tareas.esperarPendientes();

      expect(cruzado.status).toBe(404);
      expect(cruzado.texto).toBe(inexistente.texto);
      for (const tenant of [tenantA, tenantB]) {
        expect(await tenant.ticket.count()).toBe(0);
      }
      expect(await tenantB.pedidoPublicoPendiente.count()).toBe(1);
      expect(correo.enviados).toHaveLength(0);
    });

    it('cliente inactivo da 404 y no crea el ticket', async () => {
      const clienteId = await crearCliente({ slug: 'conf-inactivo', dbName: DB_A, activo: false });
      const token = await sembrarPedido(clienteId, tenantA);

      const r = await confirmar('conf-inactivo', { token });
      const inexistente = await confirmar('conf-inactivo-no', { token });
      await tareas.esperarPendientes();

      expect(r.status).toBe(404);
      expect(r.texto).toBe(inexistente.texto);
      expect(await tenantA.ticket.count()).toBe(0);
      expect(correo.enviados).toHaveLength(0);
    });

    it('un token usado da 404: la segunda confirmación no crea otro ticket ni otro mail', async () => {
      const clienteId = await crearCliente({ slug: 'conf-usado', dbName: DB_A });
      const token = await sembrarPedido(clienteId, tenantA);

      const primera = await confirmar('conf-usado', { token });
      const segunda = await confirmar('conf-usado', { token });
      await tareas.esperarPendientes();

      expect(primera.status).toBe(200);
      expect(segunda.status).toBe(404);
      expect(await tenantA.ticket.count()).toBe(1);
      expect(correo.enviados).toHaveLength(1);
    });

    it('un token vencido da 404 y no crea el ticket', async () => {
      const clienteId = await crearCliente({ slug: 'conf-vencido', dbName: DB_A });
      const token = await sembrarPedido(clienteId, tenantA, { vencido: true });

      const r = await confirmar('conf-vencido', { token });
      await tareas.esperarPendientes();

      expect(r.status).toBe(404);
      expect(await tenantA.ticket.count()).toBe(0);
      expect(correo.enviados).toHaveLength(0);
    });
  });

  describe('throttler `confirmacion` (ADR-8)', () => {
    it('el mismo token con distintos x-forwarded-for comparte cupo: el 6.º da 429', async () => {
      await crearCliente({ slug: 'conf-cupo', dbName: DB_A });

      const estados: number[] = [];
      for (let i = 0; i < 6; i++) {
        estados.push((await confirmar('conf-cupo', { token: 'token-cupo-e2e' }, `ip-${i}`)).status);
      }

      expect(estados).toEqual([404, 404, 404, 404, 404, 429]);
      // Otro token tiene su propio cupo.
      expect((await confirmar('conf-cupo', { token: 'otro-token-cupo' }, 'ip-0')).status).toBe(404);
    });
  });
});
