/**
 * ticket-asignado-notificacion.e2e.spec.ts — E2E real (HTTP → guards → use cases → Prisma REAL →
 * listener) del mail de asignación (sdd/asignacion-automatica-por-tipo, WU-6: N1, N2, N6):
 * el alta con regla y la asignación manual mandan un mail a la persona asignada, que se resuelve
 * contra el cliente activo (master real).
 *
 * DB tenant efímera propia, sembrada con el seeder real y borrada en `afterAll`.
 * `soporte_master_test` (COMPARTIDA) se trunca en `beforeEach`: requiere `usarLockMasterTest()`.
 * `EMAIL_SENDER` se overridea con un doble: nunca sale un mail real.
 */
import { randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
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
import { TicketsModule } from '../../tickets.module';
import { NotificacionesModule } from '../../../notificaciones/notificaciones.module';
import { TenantScopeMiddleware } from '../../../shared/tenancy/tenant-scope.middleware';
import { PrismaService } from '../../../shared/infrastructure/persistence/prisma.service';
import {
  MasterPrismaClient,
  TenantPrismaClient,
} from '../../../shared/infrastructure/persistence/prisma-clients';
import { PostgresAdminService } from '../../../clientes/infrastructure/postgres-admin.service';
import { TenantMigrationRunnerAdapter } from '../../../clientes/infrastructure/tenant-migration-runner.adapter';
import { TenantSeederAdapter } from '../../../clientes/infrastructure/tenant-seeder.adapter';
import { PrismaClienteRepository } from '../../../clientes/infrastructure/persistence/prisma/prisma-cliente.repository';
import { PrismaUsuarioRepository } from '../../../auth/infrastructure/persistence/prisma/prisma-usuario.repository';
import { PrismaMatrizPermisosRepository } from '../../../auth/infrastructure/persistence/prisma/prisma-matriz-permisos.repository';
import { ClienteEntity } from '../../../clientes/domain/entities/cliente.entity';
import { UsuarioEntity } from '../../../auth/domain/entities/usuario.entity';
import { Argon2HashProvider } from '../../../auth/infrastructure/argon2-hash.provider';
import { CodigoAccion } from '../../../shared/domain/acciones';
import { EMAIL_SENDER, EmailMessage } from '../../../shared/domain/ports/i-email-sender';
import { TicketResponseDto } from '../dtos/ticket.dto';
import { usarLockMasterTest } from '../../../testing/lock-master-test';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';
const TENANT_DB_NAME = `soporte_prov_asigMailE2E_${randomBytes(4).toString('hex')}_test`;
const PLAINTEXT_PASSWORD = 'E2eAsigMailSecret!123';

type Headers = Record<string, string>;

async function http<T = unknown>(
  method: 'POST' | 'PATCH',
  url: string,
  body?: unknown,
  headers: Headers = {},
): Promise<{ status: number; data: T }> {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as T;
  return { status: res.status, data };
}

const bearer = (token: string): Headers => ({ Authorization: `Bearer ${token}` });

@Module({
  imports: [SharedModule, AuthModule, TicketsModule, NotificacionesModule],
})
class TestHarnessModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantScopeMiddleware).forRoutes('*');
  }
}

// Turno exclusivo sobre la master de test compartida — ver src/testing/lock-master-test.ts.
usarLockMasterTest();

describe('Mail de asignación e2e (WU-6: N1, N2, N6)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let prismaService: PrismaService;
  let masterClient: InstanceType<typeof MasterPrismaClient>;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;
  let clienteRepo: PrismaClienteRepository;
  let usuarioRepo: PrismaUsuarioRepository;
  let permisosRepo: PrismaMatrizPermisosRepository;
  let hashProvider: Argon2HashProvider;
  let storageDir: string;
  let tipoId: string;
  let prioridadId: string;
  let cicloId: string;
  const enviados: EmailMessage[] = [];
  const fakeEmailSender = {
    send: (m: EmailMessage): Promise<void> => {
      enviados.push(m);
      return Promise.resolve();
    },
  };
  const admin = new PostgresAdminService(MASTER_TEST_URL);

  beforeAll(async () => {
    if (!process.env.DATABASE_URL_MASTER) process.env.DATABASE_URL_MASTER = MASTER_TEST_URL;
    storageDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'soporte-asigmail-e2e-'));
    process.env.STORAGE_DIR = storageDir;

    await admin.createDatabase(TENANT_DB_NAME);
    await new TenantMigrationRunnerAdapter(MASTER_TEST_URL).run(TENANT_DB_NAME);
    await new TenantSeederAdapter(MASTER_TEST_URL).seed(TENANT_DB_NAME);

    prismaService = new PrismaService(MASTER_TEST_URL);
    masterClient = prismaService.getMasterClient();
    tenantClient = prismaService.getTenantClient(TENANT_DB_NAME);
    clienteRepo = new PrismaClienteRepository(prismaService);
    usuarioRepo = new PrismaUsuarioRepository(prismaService);
    permisosRepo = new PrismaMatrizPermisosRepository(prismaService);
    hashProvider = new Argon2HashProvider();

    tipoId = (await tenantClient.tipoTicket.findUniqueOrThrow({ where: { codigo: 'SOPORTE' } })).id;
    prioridadId = (await tenantClient.prioridad.findUniqueOrThrow({ where: { codigo: 'MEDIA' } }))
      .id;
    cicloId = (
      await tenantClient.cicloCliente.create({
        data: {
          cicloVigenteId: '01900000-0000-7000-8000-000000000001',
          nombre: 'E2E Ciclo Activo',
          fechaInicio: new Date('2026-01-01'),
          fechaFin: new Date('2026-12-31'),
          activo: true,
        },
      })
    ).id;

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [TestHarnessModule],
    })
      .overrideProvider(EMAIL_SENDER)
      .useValue(fakeEmailSender)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    await app.listen(0);
    const port = (app.getHttpServer() as { address: () => { port: number } }).address().port;
    baseUrl = `http://localhost:${port}`;
  }, 90_000);

  afterAll(async () => {
    // Orden: filas → app.close() → dropDatabase (al revés el DROP falla en silencio).
    try {
      await tenantClient.reglaAsignacion.deleteMany({});
      await tenantClient.cicloCliente.delete({ where: { id: cicloId } });
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
    await fs.promises.rm(storageDir, { recursive: true, force: true }).catch(() => undefined);
  }, 60_000);

  beforeEach(async () => {
    enviados.length = 0;
    await tenantClient.reglaAsignacion.deleteMany({});
    await masterClient.$executeRawUnsafe(
      'TRUNCATE TABLE membresias, refresh_tokens, usuario_cliente_permisos, usuarios, clientes, roles RESTART IDENTITY CASCADE',
    );
  });

  async function crearActor(
    rol: string,
    celdas: CodigoAccion[],
    clienteId: string,
  ): Promise<{ usuario: UsuarioEntity; accessToken: string }> {
    const existente = await masterClient.role.findFirst({ where: { codigo: rol } });
    const rolId =
      existente?.id ??
      (
        await masterClient.role.create({
          data: { id: crypto.randomUUID(), codigo: rol, nombre: rol },
        })
      ).id;
    const usuario = UsuarioEntity.create({
      email: `e2e_asigmail_${rol.toLowerCase()}_${randomBytes(3).toString('hex')}@test.local`,
      nombre: 'E2E',
      apellido: rol,
      passwordHash: await hashProvider.hash(PLAINTEXT_PASSWORD),
      activo: true,
      isGlobalAdmin: false,
    });
    await usuarioRepo.save(usuario);
    await masterClient.membresia.create({
      data: { usuarioId: usuario.id, clienteId, rolId, activo: true },
    });
    await permisosRepo.setPermisos(usuario.id, clienteId, ['TICKETS:LECTURA', ...celdas]);
    const login = await http<{ accessToken: string }>('POST', `${baseUrl}/auth/login`, {
      email: usuario.email,
      password: PLAINTEXT_PASSWORD,
    });
    return { usuario, accessToken: login.data.accessToken };
  }

  async function escenario() {
    const cliente = ClienteEntity.create({
      nombre: `E2E AsigMail ${randomBytes(2).toString('hex')}`,
      razonSocial: null,
      cuit: null,
      dbName: TENANT_DB_NAME,
      activo: true,
    });
    await clienteRepo.save(cliente);
    const solicitante = await crearActor('USUARIO', ['TICKETS:ALTAS'], cliente.id);
    const permisosTecnico: CodigoAccion[] = [
      'TICKETS:ALTAS',
      'TICKETS:VER_TODOS',
      'TICKETS:TRANSICIONAR',
      'TICKETS:ASIGNAR',
    ];
    const tecnicoA = await crearActor('TECNICO', permisosTecnico, cliente.id);
    const tecnicoB = await crearActor('TECNICO', permisosTecnico, cliente.id);
    return { solicitante, tecnicoA, tecnicoB };
  }

  const crearTicket = (token: string, titulo: string) =>
    http<TicketResponseDto>(
      'POST',
      `${baseUrl}/tickets`,
      { titulo, tipoId, prioridadId },
      bearer(token),
    );
  const asignar = (token: string, ticketId: string, asignadoId: string) =>
    http('PATCH', `${baseUrl}/tickets/${ticketId}/asignar`, { asignadoId }, bearer(token));
  const mailsDeAsignacion = () => enviados.filter((m) => m.subject.endsWith('asignado a usted'));

  it('N1/N2: el alta con regla manda un mail al responsable de la regla', async () => {
    const { solicitante, tecnicoA } = await escenario();
    await tenantClient.reglaAsignacion.create({
      data: { tipoId, responsableId: tecnicoA.usuario.id, actualizadoPor: tecnicoA.usuario.id },
    });

    const creado = await crearTicket(solicitante.accessToken, 'Nace asignado por la regla');

    expect(creado.status).toBe(201);
    expect(creado.data.asignadoId).toBe(tecnicoA.usuario.id);
    await vi.waitFor(() => expect(mailsDeAsignacion()).toHaveLength(1));
    const mail = mailsDeAsignacion()[0];
    expect(mail.to).toBe(tecnicoA.usuario.email);
    expect(mail.subject).toBe(`Ticket ${creado.data.numero} asignado a usted`);
    expect(mail.text).toContain('automáticamente');
    expect(mail.text).toContain(`/tickets/${creado.data.id}`);
  });

  it('sin regla, el alta no manda mail de asignación', async () => {
    const { solicitante } = await escenario();

    const creado = await crearTicket(solicitante.accessToken, 'Nace sin responsable');

    expect(creado.status).toBe(201);
    await new Promise((r) => setTimeout(r, 300));
    expect(mailsDeAsignacion()).toHaveLength(0);
  });

  it('N2/N3: asignar a mano avisa al asignado, también en la autoasignación, y la reasignación avisa al nuevo', async () => {
    const { solicitante, tecnicoA, tecnicoB } = await escenario();
    const creado = await crearTicket(solicitante.accessToken, 'Asignación manual');
    const ticketId = creado.data.id;

    expect((await asignar(tecnicoA.accessToken, ticketId, tecnicoB.usuario.id)).status).toBe(200);
    await vi.waitFor(() => expect(mailsDeAsignacion()).toHaveLength(1));
    expect(mailsDeAsignacion()[0].to).toBe(tecnicoB.usuario.email);
    expect(mailsDeAsignacion()[0].text).not.toContain('automáticamente');

    // Autoasignación: el actor es el propio asignado.
    expect((await asignar(tecnicoA.accessToken, ticketId, tecnicoA.usuario.id)).status).toBe(200);
    await vi.waitFor(() => expect(mailsDeAsignacion()).toHaveLength(2));
    expect(mailsDeAsignacion()[1].to).toBe(tecnicoA.usuario.email);
  });

  it('N1: una asignación rechazada (ticket cerrado) no manda mail', async () => {
    const { solicitante, tecnicoA, tecnicoB } = await escenario();
    const creado = await crearTicket(solicitante.accessToken, 'Cerrado');
    const cerrado = await tenantClient.estado.findUniqueOrThrow({ where: { codigo: 'CERRADO' } });
    await tenantClient.ticket.update({
      where: { id: creado.data.id },
      data: { estadoId: cerrado.id },
    });

    const res = await asignar(tecnicoA.accessToken, creado.data.id, tecnicoB.usuario.id);

    expect(res.status).toBe(422);
    await new Promise((r) => setTimeout(r, 300));
    expect(mailsDeAsignacion()).toHaveLength(0);
  });
});
