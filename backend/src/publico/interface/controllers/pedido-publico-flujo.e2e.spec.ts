/**
 * pedido-publico-flujo.e2e.spec.ts — flujo completo `solicitud` -> mail -> `confirmar`
 * (sdd/formulario-publico-qr, WU-19; ADR-12).
 *
 * Cada ruta tiene su e2e; este une las dos con el link REAL que arma el servidor: el token crudo
 * sale del mail enviado (fragmento `#token=`), no se siembra a mano. App real contra Postgres real
 * y guards reales, un tenant efimero, `soporte_master_test` truncada y `EMAIL_SENDER` falso.
 */
import { randomBytes, randomUUID } from 'node:crypto';
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
import { TareasSegundoPlano } from '../../../shared/infrastructure/segundo-plano/tareas-segundo-plano';
import { usarLockMasterTest } from '../../../testing/lock-master-test';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const sufijo = randomBytes(4).toString('hex');
const DB = `soporte_prov_flujoPub_${sufijo}_test`;
const SLUG = 'flujo-completo';

class FakeEmailSender implements IEmailSender {
  enviados: EmailMessage[] = [];
  async send(msg: EmailMessage): Promise<void> {
    this.enviados.push(msg);
  }
}

@Module({ imports: [SharedModule, AuthModule, FormularioPublicoModule] })
class TestHarnessModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantScopeMiddleware).forRoutes('*');
  }
}

usarLockMasterTest();

describe('Formulario publico e2e — flujo completo solicitud -> confirmar (WU-19)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let prismaService: PrismaService;
  let masterClient: InstanceType<typeof MasterPrismaClient>;
  let tenant: InstanceType<typeof TenantPrismaClient>;
  let tareas: TareasSegundoPlano;
  let numeroConfirmado = '';
  const correo = new FakeEmailSender();
  const admin = new PostgresAdminService(MASTER_TEST_URL);

  async function limpiarTenant(): Promise<void> {
    await tenant.ticketSoporte.deleteMany();
    await tenant.operacionTicket.deleteMany();
    await tenant.ticket.deleteMany();
    await tenant.solicitanteExterno.deleteMany();
    await tenant.pedidoPublicoPendiente.deleteMany();
    await tenant.cicloCliente.deleteMany();
  }

  beforeAll(async () => {
    if (!process.env.DATABASE_URL_MASTER) {
      process.env.DATABASE_URL_MASTER = MASTER_TEST_URL;
    }
    await admin.createDatabase(DB);
    await new TenantMigrationRunnerAdapter(MASTER_TEST_URL).run(DB);

    prismaService = new PrismaService(MASTER_TEST_URL);
    masterClient = prismaService.getMasterClient();
    tenant = prismaService.getTenantClient(DB);
    await tenant.tipoTicket.create({
      data: { codigo: 'SOPORTE', nombre: 'Soporte', modulo: 'TICKETS' },
    });
    await tenant.estado.create({ data: { codigo: 'NUEVO', nombre: 'Nuevo' } });
    await tenant.tipoOperacion.create({ data: { codigo: 'CAMBIO_ESTADO', nombre: 'Cambio' } });
    await tenant.prioridad.create({ data: { codigo: 'MEDIA', nombre: 'Media' } });

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
    // Orden CRITICO: filas -> app.close() -> dropDatabase. Al reves, el DROP falla en silencio.
    try {
      await limpiarTenant();
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
    await admin.dropDatabase(DB);
  }, 60_000);

  beforeEach(async () => {
    await masterClient.$executeRawUnsafe('TRUNCATE TABLE clientes RESTART IDENTITY CASCADE');
    await limpiarTenant();
    await tenant.cicloCliente.create({
      data: {
        cicloVigenteId: randomUUID(),
        nombre: 'Ciclo e2e',
        fechaInicio: new Date('2020-01-01'),
        fechaFin: new Date('2099-12-31'),
        activo: true,
      },
    });
    correo.enviados = [];

    const clienteRepo = new PrismaClienteRepository(prismaService);
    const cliente = ClienteEntity.create({
      nombre: 'Colegio Flujo',
      razonSocial: null,
      cuit: null,
      dbName: DB,
      activo: true,
    });
    await clienteRepo.save(cliente);
    await clienteRepo.cambiarSlugSiNoCongelado(cliente.id, SLUG);
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
  });

  async function post(ruta: string, body: Record<string, unknown>): Promise<number> {
    const res = await fetch(`${baseUrl}/publico/c/${SLUG}/pedido/${ruta}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'x-forwarded-for': randomBytes(6).toString('hex'),
      },
      body: JSON.stringify(body),
    });
    if (ruta === 'confirmar' && res.status === 200) {
      numeroConfirmado = ((await res.json()) as { numero: string }).numero;
    }
    return res.status;
  }

  it('el link del mail de la solicitud confirma el pedido: un ticket, un solo uso y mail con el numero', async () => {
    const email = `ana.${sufijo}@example.com`;

    expect(
      await post('solicitud', {
        nombre: 'Ana Perez',
        email,
        titulo: 'No enciende la PC',
        descripcion: 'La PC del laboratorio no enciende.',
      }),
    ).toBe(202);
    await tareas.esperarPendientes();
    expect(correo.enviados).toHaveLength(1);
    expect(await tenant.ticket.count()).toBe(0);

    const link = /\/c\/([^/\s]+)\/pedido\/confirmar#token=([A-Za-z0-9_-]+)/.exec(
      correo.enviados[0].text ?? '',
    );
    expect(link).not.toBeNull();
    expect(link?.[1]).toBe(SLUG);
    const token = link?.[2] ?? '';

    expect(await post('confirmar', { token })).toBe(200);
    await tareas.esperarPendientes();

    const tickets = await tenant.ticket.findMany({ include: { solicitanteExterno: true } });
    expect(tickets).toHaveLength(1);
    expect(tickets[0].numero).toBe(numeroConfirmado);
    expect(tickets[0].solicitanteExterno?.email).toBe(email);
    expect(await tenant.pedidoPublicoPendiente.count()).toBe(0);
    expect(correo.enviados).toHaveLength(2);
    expect(correo.enviados[1].to).toBe(email);
    expect(correo.enviados[1].text).toContain(numeroConfirmado);

    expect(await post('confirmar', { token })).toBe(404);
    expect(await tenant.ticket.count()).toBe(1);
  });
});
