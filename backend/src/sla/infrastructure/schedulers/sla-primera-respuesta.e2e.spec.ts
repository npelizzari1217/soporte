/**
 * sla-primera-respuesta.e2e.spec.ts — E2E real (barrido → Prisma REAL → evento → listener → notificador
 * → EMAIL_SENDER fake) del aviso de primera respuesta vencida (sdd/sla-primera-respuesta-y-pausa, WU-7:
 * `sla-primera-respuesta` R4 y R6).
 *
 * DB tenant efímera propia (`soporte_prov_primRespE2E_<rand>_test`), sembrada con el seeder real y
 * borrada en `afterAll`. `soporte_master_test` (COMPARTIDA) se trunca en `beforeEach`: requiere
 * `usarLockMasterTest()`. `EMAIL_SENDER` se overridea con un doble: nunca sale un mail real.
 * Sin HTTP: el barrido se invoca como lo hace `SlaSweepScheduler`, dentro de `tenantContext.run()`.
 */
import { randomBytes } from 'node:crypto';
import { Module } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { SharedModule } from '../../../shared/shared.module';
import { TicketsModule } from '../../../tickets/tickets.module';
import { NotificacionesModule } from '../../../notificaciones/notificaciones.module';
import { SlaModule } from '../../sla.module';
import { MarcarVencidosUseCase } from '../../application/use-cases/marcar-vencidos.use-case';
import { TenantContext } from '../../../shared/tenancy/tenant-context';
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
import { ClienteEntity } from '../../../clientes/domain/entities/cliente.entity';
import { UsuarioEntity } from '../../../auth/domain/entities/usuario.entity';
import { EMAIL_SENDER, EmailMessage } from '../../../shared/domain/ports/i-email-sender';
import { usarLockMasterTest } from '../../../testing/lock-master-test';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';
const TENANT_DB_NAME = `soporte_prov_primRespE2E_${randomBytes(4).toString('hex')}_test`;
const H = 3600_000;

@Module({ imports: [SharedModule, TicketsModule, NotificacionesModule, SlaModule] })
class TestHarnessModule {}

// Turno exclusivo sobre la master de test compartida — ver src/testing/lock-master-test.ts.
usarLockMasterTest();

describe('Barrido de primera respuesta e2e (WU-7: R4, R6)', () => {
  let moduleRef: TestingModule;
  let prismaService: PrismaService;
  let masterClient: InstanceType<typeof MasterPrismaClient>;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;
  let clienteId: string;
  let usuarioRepo: PrismaUsuarioRepository;
  let tipoId: string;
  let prioridadId: string;
  let estadoId: string;
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
    await admin.createDatabase(TENANT_DB_NAME);
    await new TenantMigrationRunnerAdapter(MASTER_TEST_URL).run(TENANT_DB_NAME);
    await new TenantSeederAdapter(MASTER_TEST_URL).seed(TENANT_DB_NAME);

    prismaService = new PrismaService(MASTER_TEST_URL);
    masterClient = prismaService.getMasterClient();
    tenantClient = prismaService.getTenantClient(TENANT_DB_NAME);
    usuarioRepo = new PrismaUsuarioRepository(prismaService);
    tipoId = (await tenantClient.tipoTicket.findUniqueOrThrow({ where: { codigo: 'SOPORTE' } })).id;
    prioridadId = (await tenantClient.prioridad.findUniqueOrThrow({ where: { codigo: 'MEDIA' } }))
      .id;
    estadoId = (await tenantClient.estado.findUniqueOrThrow({ where: { codigo: 'EN_PROCESO' } }))
      .id;

    moduleRef = await Test.createTestingModule({ imports: [TestHarnessModule] })
      .overrideProvider(EMAIL_SENDER)
      .useValue(fakeEmailSender)
      .compile();
    await moduleRef.createNestApplication().init();
  }, 90_000);

  afterAll(async () => {
    // Orden: filas → app.close() → dropDatabase (al revés el DROP falla en silencio).
    await tenantClient?.ticket.deleteMany({ where: { titulo: { startsWith: 'E2E WU7' } } });
    try {
      await moduleRef?.close();
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
    enviados.length = 0;
    await masterClient.$executeRawUnsafe(
      'TRUNCATE TABLE membresias, refresh_tokens, usuario_cliente_permisos, usuarios, clientes, roles RESTART IDENTITY CASCADE',
    );
    const cliente = ClienteEntity.create({
      nombre: `E2E WU7 ${randomBytes(2).toString('hex')}`,
      razonSocial: null,
      cuit: null,
      dbName: TENANT_DB_NAME,
      activo: true,
    });
    await new PrismaClienteRepository(prismaService).save(cliente);
    clienteId = cliente.id;
  });

  async function crearUsuario(rol: string): Promise<UsuarioEntity> {
    const rolId = (
      await masterClient.role.upsert({
        where: { codigo: rol },
        update: {},
        create: { id: crypto.randomUUID(), codigo: rol, nombre: rol },
      })
    ).id;
    const usuario = UsuarioEntity.create({
      email: `e2e_wu7_${rol.toLowerCase()}_${randomBytes(3).toString('hex')}@test.local`,
      nombre: 'E2E',
      apellido: rol,
      passwordHash: 'no-se-usa',
      activo: true,
      isGlobalAdmin: false,
    });
    await usuarioRepo.save(usuario);
    await masterClient.membresia.create({
      data: { usuarioId: usuario.id, clienteId, rolId, activo: true },
    });
    return usuario;
  }

  const crearTicket = async (
    asignadoId: string | null,
    extra: { primeraRespuestaVenceAt?: Date; estado?: string } = {},
  ): Promise<string> =>
    (
      await tenantClient.ticket.create({
        data: {
          numero: `WU7-${randomBytes(3).toString('hex')}`,
          titulo: 'E2E WU7 ticket',
          tipoId,
          estadoId: extra.estado
            ? (await tenantClient.estado.findUniqueOrThrow({ where: { codigo: extra.estado } })).id
            : estadoId,
          prioridadId,
          solicitanteId: '01900000-0000-7000-8000-000000000001',
          asignadoId,
          primeraRespuestaVenceAt: extra.primeraRespuestaVenceAt,
        },
      })
    ).id;

  /** Un barrido del tenant, como lo hace `SlaSweepScheduler`. */
  const barrer = (): Promise<number> =>
    moduleRef
      .get(TenantContext)
      .run({ prismaClient: tenantClient, dbName: TENANT_DB_NAME, clienteId }, () =>
        moduleRef.get(MarcarVencidosUseCase, { strict: false }).execute(),
      );

  const mails = () => enviados.filter((m) => m.subject.startsWith('Primera respuesta vencida'));
  const vencida = () => new Date(Date.now() - 2 * H);

  it('[R4] dos barridos envían un solo mail al asignado y a cada administrador', async () => {
    const asignado = await crearUsuario('TECNICO');
    const admin1 = await crearUsuario('ADMINISTRADOR');
    const admin2 = await crearUsuario('ADMINISTRADOR');
    await crearTicket(asignado.id, { primeraRespuestaVenceAt: vencida() });

    await barrer();
    await vi.waitFor(() => expect(mails()).toHaveLength(3));
    await barrer();
    await new Promise((r) => setTimeout(r, 300));

    expect(
      mails()
        .map((m) => m.to)
        .sort(),
    ).toEqual([asignado.email, admin1.email, admin2.email].sort());
  });

  it('[R4] un administrador que es el asignado recibe un solo mail', async () => {
    const admin1 = await crearUsuario('ADMINISTRADOR');
    await crearTicket(admin1.id, { primeraRespuestaVenceAt: vencida() });

    await barrer();
    await vi.waitFor(() => expect(mails()).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 300));

    expect(mails()).toHaveLength(1);
  });

  it('[R3/R4] un ticket en espera sin respuesta igual se notifica y se marca', async () => {
    const admin1 = await crearUsuario('ADMINISTRADOR');
    const id = await crearTicket(null, {
      primeraRespuestaVenceAt: vencida(),
      estado: 'ESPERANDO_CLIENTE',
    });

    await barrer();

    await vi.waitFor(() => expect(mails().map((m) => m.to)).toEqual([admin1.email]));
    expect(
      (await tenantClient.ticket.findUniqueOrThrow({ where: { id } })).primeraRespuestaVencida,
    ).toBe(true);
  });

  it('[R6] la respuesta posterior al vencimiento cuenta como vencida y no vuelve a avisar', async () => {
    await crearUsuario('ADMINISTRADOR');
    const id = await crearTicket(null, { primeraRespuestaVenceAt: vencida() });
    await barrer();
    await vi.waitFor(() => expect(mails()).toHaveLength(1));

    await tenantClient.ticket.update({ where: { id }, data: { primeraRespuestaAt: new Date() } });
    await barrer();
    await new Promise((r) => setTimeout(r, 300));

    const fila = await tenantClient.ticket.findUniqueOrThrow({ where: { id } });
    expect(fila.primeraRespuestaVencida).toBe(true);
    expect(fila.primeraRespuestaAt!.getTime()).toBeGreaterThan(
      fila.primeraRespuestaVenceAt!.getTime(),
    );
    expect(mails()).toHaveLength(1);
  });

  it('[R6] un ticket respondido a tiempo no avisa, y sin meta tampoco', async () => {
    await crearUsuario('ADMINISTRADOR');
    const aTiempo = await crearTicket(null, { primeraRespuestaVenceAt: vencida() });
    await tenantClient.ticket.update({
      where: { id: aTiempo },
      data: { primeraRespuestaAt: new Date(Date.now() - 3 * H) },
    });
    await crearTicket(null);

    await barrer();
    await new Promise((r) => setTimeout(r, 300));

    expect(mails()).toHaveLength(0);
  });
});
