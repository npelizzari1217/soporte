/**
 * esperando-cliente.e2e.spec.ts — E2E real (HTTP → guards → use cases → Prisma REAL → listeners)
 * de la reanudación por comentario y del mail de espera (sdd/sla-primera-respuesta-y-pausa, WU-4):
 * `ticket-esperando-cliente` R3 y R4, y `sla-reloj-activo` R1 (el marcador del reloj).
 *
 * DB tenant efímera propia (`soporte_prov_espClE2E_<rand>_test`), sembrada con el seeder real y
 * borrada en `afterAll`. `soporte_master_test` (COMPARTIDA) se trunca en `beforeEach`: requiere
 * `usarLockMasterTest()`. `EMAIL_SENDER` se overridea con un doble: nunca sale un mail real.
 *
 * El harness monta `TicketsModule` (donde vive `ReanudarPorComentarioListener`) y
 * `NotificacionesModule` (donde vive el mail de espera). El `SlaModule` no se monta: el reloj se
 * comprueba por el marcador (`sla_reloj_version`) que escribe `TransicionarEstadoUseCase`.
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
import { OperacionResponseDto, TicketResponseDto } from '../dtos/ticket.dto';
import { usarLockMasterTest } from '../../../testing/lock-master-test';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';
const TENANT_DB_NAME = `soporte_prov_espClE2E_${randomBytes(4).toString('hex')}_test`;
const PLAINTEXT_PASSWORD = 'E2eEsperaSecret!123';

type Headers = Record<string, string>;

async function http<T = unknown>(
  method: 'GET' | 'POST' | 'PATCH',
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

describe('Ticket esperando al cliente e2e (WU-4: R3, R4)', () => {
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
    storageDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'soporte-espera-e2e-'));
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
    await masterClient.$executeRawUnsafe(
      'TRUNCATE TABLE membresias, refresh_tokens, usuario_cliente_permisos, usuarios, clientes, roles RESTART IDENTITY CASCADE',
    );
  });

  async function crearActor(
    rol: string,
    celdas: CodigoAccion[],
    clienteId: string,
  ): Promise<{ usuario: UsuarioEntity; accessToken: string }> {
    const rolId = (
      await masterClient.role.create({
        data: { id: crypto.randomUUID(), codigo: rol, nombre: rol },
      })
    ).id;
    const usuario = UsuarioEntity.create({
      email: `e2e_espera_${rol.toLowerCase()}_${randomBytes(3).toString('hex')}@test.local`,
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
      nombre: `E2E Espera ${randomBytes(2).toString('hex')}`,
      razonSocial: null,
      cuit: null,
      dbName: TENANT_DB_NAME,
      activo: true,
    });
    await clienteRepo.save(cliente);
    const solicitante = await crearActor(
      'USUARIO',
      ['TICKETS:ALTAS', 'TICKETS:COMENTAR', 'TICKETS:OBSERVAR'],
      cliente.id,
    );
    const tecnico = await crearActor(
      'TECNICO',
      [
        'TICKETS:ALTAS',
        'TICKETS:COMENTAR',
        'TICKETS:VER_TODOS',
        'TICKETS:TRANSICIONAR',
        'TICKETS:ASIGNAR',
      ],
      cliente.id,
    );
    const creado = await http<TicketResponseDto>(
      'POST',
      `${baseUrl}/tickets`,
      { titulo: 'Ticket en espera', tipoId, prioridadId },
      bearer(solicitante.accessToken),
    );
    const ticketId = creado.data.id;
    for (const nuevoEstadoCodigo of ['ASIGNADO', 'EN_PROCESO', 'ESPERANDO_CLIENTE']) {
      const r = await http(
        'PATCH',
        `${baseUrl}/tickets/${ticketId}/estado`,
        { nuevoEstadoCodigo },
        bearer(tecnico.accessToken),
      );
      expect(r.status).toBe(200);
    }
    return { solicitante, tecnico, ticketId };
  }

  const estadoActual = async (ticketId: string): Promise<string> => {
    const t = await tenantClient.ticket.findUniqueOrThrow({
      where: { id: ticketId },
      include: { estado: true },
    });
    return t.estado.codigo;
  };
  const versionReloj = async (ticketId: string): Promise<number> =>
    (await tenantClient.ticket.findUniqueOrThrow({ where: { id: ticketId } })).slaRelojVersion;
  const comentar = (token: string, ticketId: string, esInterno: boolean) =>
    http<OperacionResponseDto>(
      'POST',
      `${baseUrl}/tickets/${ticketId}/comentarios`,
      { texto: esInterno ? 'Nota interna' : 'Ya les respondo', esInterno },
      bearer(token),
    );
  const mailsDeEspera = () =>
    enviados.filter((m) => m.text.includes('a la espera de tu respuesta'));

  it('R4: EN_PROCESO→ESPERANDO_CLIENTE envía un mail al solicitante', async () => {
    const { solicitante } = await escenario();

    await vi.waitFor(() => expect(mailsDeEspera()).toHaveLength(1));

    expect(mailsDeEspera()[0].to).toBe(solicitante.usuario.email);
  });

  it('R3 + invariante "comentario interno": interno del solicitante o público de otro no reanudan; público del solicitante sí', async () => {
    const { solicitante, tecnico, ticketId } = await escenario();
    const versionEnEspera = await versionReloj(ticketId);
    expect(await estadoActual(ticketId)).toBe('ESPERANDO_CLIENTE');

    // Comentario INTERNO del solicitante: no emite `ticket.comentado`, el ticket sigue esperando.
    expect((await comentar(solicitante.accessToken, ticketId, true)).status).toBe(201);
    // Comentario PÚBLICO de un técnico: otra persona, no reanuda.
    expect((await comentar(tecnico.accessToken, ticketId, false)).status).toBe(201);
    await new Promise((r) => setTimeout(r, 300));
    expect(await estadoActual(ticketId)).toBe('ESPERANDO_CLIENTE');
    expect(await versionReloj(ticketId)).toBe(versionEnEspera);

    // Comentario PÚBLICO del solicitante: vuelve a EN_PROCESO por el arco normal.
    expect((await comentar(solicitante.accessToken, ticketId, false)).status).toBe(201);
    await vi.waitFor(async () => expect(await estadoActual(ticketId)).toBe('EN_PROCESO'));

    // El reloj se reanuda: el marcador se incrementó con la salida de la espera.
    expect(await versionReloj(ticketId)).toBe(versionEnEspera + 1);
    // El timeline muestra el cambio con el solicitante como autor.
    const timeline = await http<OperacionResponseDto[]>(
      'GET',
      `${baseUrl}/tickets/${ticketId}/timeline`,
      undefined,
      bearer(solicitante.accessToken),
    );
    const estadoEnProceso = (
      await tenantClient.estado.findUniqueOrThrow({ where: { codigo: 'EN_PROCESO' } })
    ).id;
    const reanudacion = timeline.data.filter(
      (op) => op.estadoNuevoId === estadoEnProceso && op.autorId === solicitante.usuario.id,
    );
    expect(reanudacion).toHaveLength(1);
    // La salida de la espera no reenvía el mail de espera.
    expect(mailsDeEspera()).toHaveLength(1);
  });

  it('sla-primera-respuesta R1 "Eventos que no cuentan": asignar y cambiar de estado dejan primera_respuesta_at en NULL; el primer público de un no solicitante la fija', async () => {
    const { tecnico, ticketId } = await escenario();
    const primeraRespuesta = async (): Promise<Date | null> =>
      (await tenantClient.ticket.findUniqueOrThrow({ where: { id: ticketId } })).primeraRespuestaAt;

    // escenario() ya cambió de estado tres veces (ASIGNADO, EN_PROCESO, ESPERANDO_CLIENTE).
    expect(await primeraRespuesta()).toBeNull();

    // Asignación manual del técnico.
    const asignado = await http(
      'PATCH',
      `${baseUrl}/tickets/${ticketId}/asignar`,
      { asignadoId: tecnico.usuario.id },
      bearer(tecnico.accessToken),
    );
    expect(asignado.status).toBe(200);
    // Un cambio de estado más, después de asignar.
    const transicion = await http(
      'PATCH',
      `${baseUrl}/tickets/${ticketId}/estado`,
      { nuevoEstadoCodigo: 'EN_PROCESO' },
      bearer(tecnico.accessToken),
    );
    expect(transicion.status).toBe(200);
    expect(await primeraRespuesta()).toBeNull();

    // El primer comentario público de un no solicitante sí la registra.
    expect((await comentar(tecnico.accessToken, ticketId, false)).status).toBe(201);
    expect(await primeraRespuesta()).not.toBeNull();
  });
});
