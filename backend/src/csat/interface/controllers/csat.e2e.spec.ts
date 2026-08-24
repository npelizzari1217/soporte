/**
 * csat.e2e.spec.ts — E2E real de punta a punta (HTTP → `CsatThrottlerGuard`
 * → `EncuestaPublicaController` → use cases → `ResolverEncuestaTokenService`
 * → Prisma REAL, master + tenant) del endpoint público de encuesta (WU7,
 * tarea 7.5).
 *
 * SEGURIDAD: el endpoint es anónimo y escribe en el tenant SIN sesión. Los
 * tests cubren, además de los 6 escenarios de la tarea, el requisito más
 * peligroso del WU — que TODOS los rechazos (inexistente, vencido, usado,
 * revocado, cliente inactivo) sean HTTP-indistinguibles entre sí (mismo
 * status, mismo cuerpo exacto): un actor anónimo no puede usarlos como
 * oráculo para enumerar tokens.
 *
 * Aislamiento: provisiona UNA sola DB tenant efímera
 * (`soporte_prov_csatE2E_<rand>_test`, mismo patrón que
 * `tickets.e2e.spec.ts`), sembrada UNA vez en `beforeAll` y dropeada en
 * `afterAll`. `master.clientes`/`encuesta_tokens` (DB `soporte_master_test`,
 * COMPARTIDA) se truncan en `beforeEach` — requiere `usarLockMasterTest()`.
 *
 * Ref spec: sdd/csat/spec, Requirement "Validación del token en el endpoint
 * público", "Cliente inactivo o eliminado no acepta escrituras", "Registro
 * de la respuesta (uso único)", "Respuesta HTTP mínima", "Rate limiting en
 * las rutas públicas". Ref design: ADR-C1, ADR-C2, ADR-C6. Tarea: 7.5.
 */
import { createHash, randomBytes } from 'node:crypto';
import {
  INestApplication,
  MiddlewareConsumer,
  Module,
  NestModule,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { SharedModule } from '../../../shared/shared.module';
import { AuthModule } from '../../../auth/auth.module';
import { TicketsModule } from '../../../tickets/tickets.module';
import { NotificacionesModule } from '../../../notificaciones/notificaciones.module';
import { CsatModule } from '../../csat.module';
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
import { ClienteEntity } from '../../../clientes/domain/entities/cliente.entity';
import { PrismaEncuestaTokenRepository } from '../../infrastructure/persistence/prisma/prisma-encuesta-token.repository';
import { EncuestaTokenEntity } from '../../domain/entities/encuesta-token.entity';
import { TicketCsatListener } from '../../infrastructure/listeners/ticket-csat.listener';
import { TicketEstadoCambiadoEvent } from '../../../tickets/domain/events/ticket-estado-cambiado.event';
import { TenantContext } from '../../../shared/tenancy/tenant-context';
import { EncuestaPublicaResponseDto } from '../dtos/encuesta.dto';
import { usarLockMasterTest } from '../../../testing/lock-master-test';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const TENANT_DB_NAME = `soporte_prov_csatE2E_${randomBytes(4).toString('hex')}_test`;
const VIGENCIA_TOKEN_MS = 30 * 24 * 60 * 60 * 1000;

// ─── Helpers HTTP (fetch nativo, mismo patrón que tickets.e2e.spec.ts) ──────

interface HttpResult<T> {
  status: number;
  data: T;
}

async function httpGet<T = unknown>(url: string): Promise<HttpResult<T>> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  const data = (await res.json().catch(() => null)) as T;
  return { status: res.status, data };
}

async function httpPost<T = unknown>(url: string, body: unknown): Promise<HttpResult<T>> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as T;
  return { status: res.status, data };
}

@Module({ imports: [SharedModule, AuthModule, TicketsModule, NotificacionesModule, CsatModule] })
class TestHarnessModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantScopeMiddleware).forRoutes('*');
  }
}

// Turno exclusivo sobre la master de test compartida — ver src/testing/lock-master-test.ts.
usarLockMasterTest();

describe('CSAT e2e — endpoint público (7.5)', () => {
  let app: INestApplication;
  let baseUrl: string;

  let prismaService: PrismaService;
  let masterClient: InstanceType<typeof MasterPrismaClient>;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;
  let clienteRepo: PrismaClienteRepository;
  let tokenRepo: PrismaEncuestaTokenRepository;
  let ticketCsatListener: TicketCsatListener;
  let tenantContext: TenantContext;
  let eventEmitter: EventEmitter2;

  const admin = new PostgresAdminService(MASTER_TEST_URL);

  let tipoSoporteId: string;
  let estadoNuevoId: string;
  let prioridadMediaId: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL_MASTER) {
      process.env.DATABASE_URL_MASTER = MASTER_TEST_URL;
    }
    // APP_BASE_URL no se usa en este WU (los tokens se siembran directo por
    // repo, sin pasar por EmitirEncuestaUseCase/mail) salvo en el escenario
    // "flag off", que corta ANTES de necesitarla.

    await admin.createDatabase(TENANT_DB_NAME);
    await new TenantMigrationRunnerAdapter(MASTER_TEST_URL).run(TENANT_DB_NAME);
    await new TenantSeederAdapter(MASTER_TEST_URL).seed(TENANT_DB_NAME);

    prismaService = new PrismaService(MASTER_TEST_URL);
    masterClient = prismaService.getMasterClient();
    tenantClient = prismaService.getTenantClient(TENANT_DB_NAME);
    clienteRepo = new PrismaClienteRepository(prismaService);
    tokenRepo = new PrismaEncuestaTokenRepository(prismaService);

    const tipoSoporte = await tenantClient.tipoTicket.findUniqueOrThrow({
      where: { codigo: 'SOPORTE' },
    });
    tipoSoporteId = tipoSoporte.id;
    const estadoNuevo = await tenantClient.estado.findUniqueOrThrow({ where: { codigo: 'NUEVO' } });
    estadoNuevoId = estadoNuevo.id;
    const prioridadMedia = await tenantClient.prioridad.findUniqueOrThrow({
      where: { codigo: 'MEDIA' },
    });
    prioridadMediaId = prioridadMedia.id;

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [TestHarnessModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    await app.listen(0);

    ticketCsatListener = moduleRef.get(TicketCsatListener);
    tenantContext = moduleRef.get(TenantContext);
    eventEmitter = moduleRef.get(EventEmitter2);

    const port = (app.getHttpServer() as { address: () => { port: number } }).address().port;
    baseUrl = `http://localhost:${port}`;
  }, 90_000);

  afterAll(async () => {
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
    // encuesta_tokens tiene FK a clientes — CASCADE arrastra ambas (mismo
    // patrón que prisma-encuesta-token.repository.integration.spec.ts).
    await masterClient.$executeRawUnsafe(
      'TRUNCATE TABLE encuesta_tokens, clientes RESTART IDENTITY CASCADE',
    );
  });

  // ─── Fixtures ────────────────────────────────────────────────────────────

  async function crearCliente(
    overrides: Partial<{ csatHabilitado: boolean; activo: boolean }> = {},
  ): Promise<ClienteEntity> {
    const cliente = ClienteEntity.create({
      nombre: `E2E CSAT ${randomBytes(2).toString('hex')}`,
      razonSocial: null,
      cuit: null,
      dbName: TENANT_DB_NAME,
      activo: overrides.activo ?? true,
      csatHabilitado: overrides.csatHabilitado ?? true,
    });
    await clienteRepo.save(cliente);
    return cliente;
  }

  async function crearTicket(
    overrides: Partial<{ titulo: string; descripcion: string; solicitanteId: string }> = {},
  ) {
    return tenantClient.ticket.create({
      data: {
        numero: `CSAT-E2E-${randomBytes(4).toString('hex').toUpperCase()}`,
        titulo: overrides.titulo ?? 'Título privado del ticket',
        descripcion: overrides.descripcion ?? 'Descripción privada del ticket',
        tipoId: tipoSoporteId,
        estadoId: estadoNuevoId,
        prioridadId: prioridadMediaId,
        solicitanteId: overrides.solicitanteId ?? '01977a00-0000-7000-8000-000000000abc',
      },
    });
  }

  /**
   * Usuario REAL en MASTER (WU11.1) — `IUsuarioContactoResolver.resolverContacto`
   * hace un `findFirst` contra `usuario` y devuelve `null` si no existe, lo
   * que corta el listener ANTES de emitir el token. El fixture original
   * (`solicitanteId` fijo, sin fila) alcanza para los tests que no ejercitan
   * el listener de punta a punta, pero no para este.
   */
  async function crearSolicitanteConEmail(): Promise<{ id: string; email: string }> {
    const email = `csat-e2e-${randomBytes(4).toString('hex')}@integration.test`;
    const usuario = await masterClient.usuario.create({
      data: {
        email,
        nombre: 'Solicitante',
        apellido: 'E2E',
        passwordHash: 'hash-fake',
        activo: true,
        deletedAt: null,
      },
    });
    return { id: usuario.id, email };
  }

  /** Genera y persiste un token VIGENTE (no usado, no revocado, no vencido). */
  async function crearTokenVigente(
    clienteId: string,
    ticketId: string,
  ): Promise<{ rawToken: string; tokenId: string }> {
    const rawToken = randomBytes(16).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const token = EncuestaTokenEntity.create({
      clienteId,
      ticketId,
      tokenHash,
      expiresAt: new Date(Date.now() + VIGENCIA_TOKEN_MS),
      usedAt: null,
      revokedAt: null,
    });
    await tokenRepo.save(token);
    return { rawToken, tokenId: token.id };
  }

  // ─── 1. Flujo completo ───────────────────────────────────────────────────

  it('flujo completo: GET válido → 200 con el número, POST válido → 200 y persiste la respuesta', async () => {
    const cliente = await crearCliente();
    const ticket = await crearTicket();
    const { rawToken, tokenId } = await crearTokenVigente(cliente.id, ticket.id);

    const get = await httpGet<EncuestaPublicaResponseDto>(
      `${baseUrl}/publico/encuesta/${rawToken}`,
    );
    expect(get.status).toBe(200);
    expect(get.data).toEqual({ numero: ticket.numero });

    const post = await httpPost<EncuestaPublicaResponseDto>(
      `${baseUrl}/publico/encuesta/${rawToken}`,
      { puntaje: 5, comentario: 'Excelente atención' },
    );
    expect(post.status).toBe(200);
    expect(post.data).toEqual({ numero: ticket.numero });

    const respuesta = await tenantClient.encuestaSatisfaccion.findUnique({ where: { tokenId } });
    expect(respuesta).not.toBeNull();
    expect(respuesta!.puntaje).toBe(5);
    expect(respuesta!.comentario).toBe('Excelente atención');
    expect(respuesta!.ticketId).toBe(ticket.id);

    const tokenFila = await masterClient.encuestaToken.findUnique({ where: { id: tokenId } });
    expect(tokenFila!.usedAt).not.toBeNull();
  });

  // ─── 1b. El listener está CABLEADO al EventEmitter2 real (WU11.1) ───────
  //
  // Tarea 11.1 (verify #2507, CRITICAL-1): romper el nombre del evento en
  // `@OnEvent('ticket.estado_cambiado')` dejaba 86/86 en verde porque los
  // tests existentes invocan `onTicketEstadoCambiado` A MANO (llamada
  // directa) o usan `.compile()` (no ejecuta `onApplicationBootstrap`, que
  // es donde `EventSubscribersLoader` registra los `@OnEvent`). Este test
  // usa el `EventEmitter2` REAL del contenedor ya inicializado con
  // `app.init()` — el único camino que puede ver ese bug.

  it('[CRITICAL WU11.1] emitir ticket.estado_cambiado por el EventEmitter2 real dispara TicketCsatListener', async () => {
    const cliente = await crearCliente();
    const solicitante = await crearSolicitanteConEmail();
    const ticket = await crearTicket({ solicitanteId: solicitante.id });

    await tenantContext.run(
      { prismaClient: tenantClient, dbName: TENANT_DB_NAME, clienteId: cliente.id },
      () => {
        eventEmitter.emit(
          'ticket.estado_cambiado',
          new TicketEstadoCambiadoEvent({
            ticketId: ticket.id,
            estadoAnteriorCodigo: 'EN_PROCESO',
            estadoNuevoCodigo: 'CERRADO',
            autorId: '01977a00-0000-7000-8000-000000000aaa',
          }),
        );
        return Promise.resolve();
      },
    );

    // `emit()` es SÍNCRONO y no espera a los handlers async — el listener
    // sigue corriendo después de que `emit()` retorna (ADR-P8), por eso se
    // espera el efecto observable (el token en MASTER) en vez del retorno.
    await vi.waitFor(async () => {
      const cantidad = await masterClient.encuestaToken.count({ where: { clienteId: cliente.id } });
      expect(cantidad).toBe(1);
    });
  });

  // ─── 2. Payload sin título ni descripción ───────────────────────────────

  it('[CRITICAL] payload sin título ni descripción — GET y POST devuelven ÚNICAMENTE el número', async () => {
    const cliente = await crearCliente();
    const ticket = await crearTicket({
      titulo: 'SECRETO-TITULO-QUE-NO-DEBE-SALIR',
      descripcion: 'SECRETO-DESCRIPCION-QUE-NO-DEBE-SALIR',
    });
    const { rawToken } = await crearTokenVigente(cliente.id, ticket.id);

    const get = await httpGet<EncuestaPublicaResponseDto>(
      `${baseUrl}/publico/encuesta/${rawToken}`,
    );
    expect(Object.keys(get.data as object)).toEqual(['numero']);
    expect(JSON.stringify(get.data)).not.toContain('SECRETO');

    const post = await httpPost<EncuestaPublicaResponseDto>(
      `${baseUrl}/publico/encuesta/${rawToken}`,
      { puntaje: 3, comentario: null },
    );
    expect(Object.keys(post.data as object)).toEqual(['numero']);
    expect(JSON.stringify(post.data)).not.toContain('SECRETO');
  });

  // ─── 3. Segundo POST → 404 ───────────────────────────────────────────────

  it('segundo POST con el mismo token → 404 genérico, sin segunda fila', async () => {
    const cliente = await crearCliente();
    const ticket = await crearTicket();
    const { rawToken } = await crearTokenVigente(cliente.id, ticket.id);

    const primero = await httpPost(`${baseUrl}/publico/encuesta/${rawToken}`, {
      puntaje: 4,
      comentario: null,
    });
    expect(primero.status).toBe(200);

    const segundo = await httpPost(`${baseUrl}/publico/encuesta/${rawToken}`, {
      puntaje: 4,
      comentario: null,
    });
    expect(segundo.status).toBe(404);

    const cantidad = await tenantClient.encuestaSatisfaccion.count({
      where: { ticketId: ticket.id },
    });
    expect(cantidad).toBe(1);
  });

  // ─── 4. Cliente dado de baja → 404 ──────────────────────────────────────

  it('cliente dado de baja (activo=false) → 404, sin bindear el tenant', async () => {
    const cliente = await crearCliente({ activo: false });
    const ticket = await crearTicket();
    const { rawToken } = await crearTokenVigente(cliente.id, ticket.id);

    const get = await httpGet(`${baseUrl}/publico/encuesta/${rawToken}`);

    expect(get.status).toBe(404);
  });

  // ─── 5. Flag off → sin tokens ────────────────────────────────────────────

  it('[CRITICAL] cliente con csatHabilitado=false: el listener real no emite ningún token', async () => {
    const cliente = await crearCliente({ csatHabilitado: false });

    await tenantContext.run(
      { prismaClient: tenantClient, dbName: TENANT_DB_NAME, clienteId: cliente.id },
      () =>
        ticketCsatListener.onTicketEstadoCambiado(
          new TicketEstadoCambiadoEvent({
            ticketId: '01977a00-0000-7000-8000-000000000fff',
            estadoAnteriorCodigo: 'EN_PROCESO',
            estadoNuevoCodigo: 'CERRADO',
            autorId: '01977a00-0000-7000-8000-000000000aaa',
          }),
        ),
    );

    const cantidad = await masterClient.encuestaToken.count({ where: { clienteId: cliente.id } });
    expect(cantidad).toBe(0);
  });

  // ─── 6. 429 al exceder el cupo ───────────────────────────────────────────

  it('[CRITICAL] excede el cupo del throttler (ADR-C6) → 429 en la request de más', async () => {
    // Cantidad de requests FIJA a propósito — NO importada de
    // `CSAT_THROTTLE_LIMIT` (si el test leyera la misma constante que
    // configura el guard, un cambio futuro del cupo de producción jamás
    // podría poner este test en rojo: se autoajustaría). El valor de
    // producción hoy es 10 — 12 requests agotan cualquier cupo <= 10.
    const REQUESTS_SUFICIENTES_PARA_AGOTAR_EL_CUPO_ACTUAL = 12;

    const cliente = await crearCliente();
    const ticket = await crearTicket();
    const { rawToken } = await crearTokenVigente(cliente.id, ticket.id);

    const respuestas: number[] = [];
    for (let i = 0; i < REQUESTS_SUFICIENTES_PARA_AGOTAR_EL_CUPO_ACTUAL; i += 1) {
      // GET no consume el token (CAS solo en POST) — repetible sin efectos
      // secundarios sobre el estado del token.

      const { status } = await httpGet(`${baseUrl}/publico/encuesta/${rawToken}`);
      respuestas.push(status);
    }

    expect(respuestas).toContain(429);
  });

  // ─── Anti-enumeración: TODOS los rechazos son indistinguibles ──────────

  it('[CRITICAL] token inexistente, vencido, usado y revocado responden EXACTAMENTE lo mismo (status + cuerpo)', async () => {
    const cliente = await crearCliente();
    const ticket = await crearTicket();

    const tokenInexistente = randomBytes(16).toString('hex');

    const tokenVencidoRaw = randomBytes(16).toString('hex');
    await tokenRepo.save(
      EncuestaTokenEntity.create({
        clienteId: cliente.id,
        ticketId: ticket.id,
        tokenHash: createHash('sha256').update(tokenVencidoRaw).digest('hex'),
        expiresAt: new Date(Date.now() - 1000),
        usedAt: null,
        revokedAt: null,
      }),
    );

    const { rawToken: tokenUsadoRaw } = await crearTokenVigente(cliente.id, ticket.id);
    await httpPost(`${baseUrl}/publico/encuesta/${tokenUsadoRaw}`, {
      puntaje: 2,
      comentario: null,
    });

    const tokenRevocadoRaw = randomBytes(16).toString('hex');
    const tokenRevocado = EncuestaTokenEntity.create({
      clienteId: cliente.id,
      ticketId: ticket.id,
      tokenHash: createHash('sha256').update(tokenRevocadoRaw).digest('hex'),
      expiresAt: new Date(Date.now() + VIGENCIA_TOKEN_MS),
      usedAt: null,
      revokedAt: null,
    });
    tokenRevocado.revoke();
    await tokenRepo.save(tokenRevocado);

    const respuestas = await Promise.all(
      [tokenInexistente, tokenVencidoRaw, tokenUsadoRaw, tokenRevocadoRaw].map((token) =>
        httpGet(`${baseUrl}/publico/encuesta/${token}`),
      ),
    );

    const [primera, ...resto] = respuestas;
    expect(primera.status).toBe(404);
    for (const respuesta of resto) {
      expect(respuesta.status).toBe(primera.status);
      expect(respuesta.data).toEqual(primera.data);
    }
  });
});
