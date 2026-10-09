/**
 * generar-preventivos.integration.spec.ts — WU-5 (5.8-5.13) + WU-6 (6.1),
 * integración contra Postgres REAL. Provisiona una DB tenant EFÍMERA
 * (`soporte_prov_prevGenE2E_<rand>_test`), la migra y la siembra con
 * `TenantSeederAdapter.seed()` real — mismo patrón que
 * `equipos/mantenimiento.integration.spec.ts`: `CrearTicketUseCase` resuelve
 * internamente los códigos FIJOS "NUEVO"/"CAMBIO_ESTADO" por catálogo real
 * (no aceptan prefijo de test), así que no alcanza con fixtures prefijados
 * sobre `soporte_tenant_test` compartida.
 *
 * Sin Nest app (wiring manual de todos los repos/use cases, igual que el
 * precedente): no hay `app.close()` que llamar. Higiene equivalente (5.13):
 * `prismaService.onModuleDestroy()` (libera el pool) → `admin.dropDatabase()`.
 * No toca `soporte_master`, `soporte_tenant_test` ni ninguna DB compartida.
 *
 * `IUsuarioMasterChecker.existeEnTenant` es un doble controlable: WU-5 no
 * tiene un master real poblado con el `responsableId` del plan, y la
 * FALLA de ese chequeo es justamente el disparador de 5.12 [R9].
 *
 * Ref spec: sdd/preventivo/spec, Requirements "Idempotencia por clave de
 * base...", "Recuperación de corrida perdida sin ráfaga", "No-solapamiento
 * con preventivo abierto sin atender", "Solicitante del ticket generado...",
 * "Notificación solo al generar". Ref design: ADR-PV2, ADR-PV3, ADR-PV4,
 * ADR-PV5. Tarea: 5.8-5.13, 6.1.
 */
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../shared/infrastructure/persistence/prisma-clients';
import {
  IDomainEventPublisher,
  DomainEvent,
} from '../shared/domain/ports/i-domain-event-publisher';

import { PostgresAdminService } from '../clientes/infrastructure/postgres-admin.service';
import { TenantMigrationRunnerAdapter } from '../clientes/infrastructure/tenant-migration-runner.adapter';
import { TenantSeederAdapter } from '../clientes/infrastructure/tenant-seeder.adapter';

import { PrismaTicketRepository } from '../tickets/infrastructure/persistence/prisma/prisma-ticket.repository';
import { PrismaOperacionTicketRepository } from '../tickets/infrastructure/persistence/prisma/prisma-operacion-ticket.repository';
import { PrismaEstadoRepository } from '../tickets/infrastructure/persistence/prisma/prisma-estado.repository';
import { PrismaTipoTicketRepository } from '../tickets/infrastructure/persistence/prisma/prisma-tipo-ticket.repository';
import { PrismaPrioridadRepository } from '../tickets/infrastructure/persistence/prisma/prisma-prioridad.repository';
import { PrismaTipoOperacionRepository } from '../tickets/infrastructure/persistence/prisma/prisma-tipo-operacion.repository';
import { PrismaCicloClienteRepository } from '../tickets/infrastructure/persistence/prisma/prisma-ciclo-cliente.repository';
import { PrismaTenantTransactionRunner } from '../shared/infrastructure/persistence/tenant-transaction-runner';
import { NumeradorTicket } from '../tickets/domain/services/numerador-ticket.service';
import { ResolverCicloActivoParaCreacion } from '../tickets/application/services/resolver-ciclo-activo.service';
import { CrearTicketUseCase } from '../tickets/application/use-cases/crear-ticket.use-case';
import { IUsuarioMasterChecker } from '../tickets/domain/ports/i-usuario-master.checker';

import { PrismaPlanPreventivoRepository } from './infrastructure/persistence/prisma/prisma-plan-preventivo.repository';
import { PrismaPreventivoGeneracionRepository } from './infrastructure/persistence/prisma/prisma-preventivo-generacion.repository';
import { PlanPreventivoEntity } from './domain/entities/plan-preventivo.entity';
import { CalcularCicloService } from './domain/services/calcular-ciclo.service';
import { GenerarPreventivosUseCase } from './application/use-cases/generar-preventivos.use-case';
import { IEquipoInformaticoRepository } from '../equipos/domain/ports/i-equipo-informatico.repository';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const TENANT_DB_NAME = `soporte_prov_prevGenE2E_${randomBytes(4).toString('hex')}_test`;
const CLIENTE_ID = 'prev-gen-e2e-cliente';
const DUMMY_RESPONSABLE_ID = '01900000-0000-7000-8000-000000000101';

/** Publisher no-op — usado para `TicketCreadoEvent` (SLA), fuera de alcance acá. */
class NoopDomainEventPublisher implements IDomainEventPublisher {
  publish(_event: DomainEvent): void {
    // no-op
  }
}

/**
 * Publisher que graba los eventos publicados — WU-6 [R11]: prueba que
 * `alCommitear()` corre de verdad DESPUÉS del commit real de Prisma (un
 * mock `run: fn => fn()` no puede reproducir esto, mismo criterio que
 * `apply-progress-wu5-postcommit`).
 */
class RecordingDomainEventPublisher implements IDomainEventPublisher {
  readonly publicados: DomainEvent[] = [];
  publish(event: DomainEvent): void {
    this.publicados.push(event);
  }
}

describe('GenerarPreventivosUseCase — Integration (5.8-5.13, 6.1)', () => {
  const admin = new PostgresAdminService(MASTER_TEST_URL);

  let prismaService: PrismaService;
  let tenantClient: InstanceType<typeof TenantPrismaClient>;
  let tenantContext: TenantContext;

  let planRepo: PrismaPlanPreventivoRepository;
  let generacionRepo: PrismaPreventivoGeneracionRepository;
  let crearTicketUseCase: CrearTicketUseCase;
  let generarPreventivosUseCase: GenerarPreventivosUseCase;
  let eventPublisher: RecordingDomainEventPublisher;
  let usuarioMasterChecker: IUsuarioMasterChecker & {
    existeEnTenant: ReturnType<typeof vi.fn<(u: string, c: string) => Promise<boolean>>>;
  };
  let logger: { error: ReturnType<typeof vi.fn<(mensaje: string) => void>> };

  let prioridadId: string;
  let tipoPreventivoId: string;

  const RUN_PREFIX = randomBytes(3).toString('hex');
  let planCounter = 0;
  function nextTitulo(): string {
    planCounter += 1;
    return `PLAN_PREV_GEN_TEST_${RUN_PREFIX}_${planCounter}`;
  }

  /** Medianoche UTC de HOY — ancla estable para construir fixtures "vencidos". */
  function medianocheHoy(): Date {
    const ahora = new Date();
    return new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate()));
  }

  function restarDias(fecha: Date, dias: number): Date {
    return new Date(fecha.getTime() - dias * 24 * 60 * 60 * 1000);
  }

  function withTenant<T>(fn: () => Promise<T>): Promise<T> {
    return tenantContext.run(
      { prismaClient: tenantClient, dbName: TENANT_DB_NAME, clienteId: CLIENTE_ID },
      fn,
    );
  }

  async function crearPlan(
    overrides: Partial<Parameters<typeof PlanPreventivoEntity.create>[0]> = {},
  ): Promise<PlanPreventivoEntity> {
    const mediaNoche = medianocheHoy();
    const plan = PlanPreventivoEntity.create({
      titulo: nextTitulo(),
      instrucciones: null,
      equipoId: null,
      ubicacion: 'DEPOSITO PREVENTIVO TEST',
      prioridadId,
      responsableId: DUMMY_RESPONSABLE_ID,
      intervaloValor: 7,
      intervaloUnidad: 'DIAS',
      fechaInicio: mediaNoche,
      proximaEjecucionEn: mediaNoche,
      activo: true,
      ...overrides,
    }).getValue();
    await withTenant(() => planRepo.guardar(plan));
    return plan;
  }

  beforeAll(async () => {
    await admin.createDatabase(TENANT_DB_NAME);
    await new TenantMigrationRunnerAdapter(MASTER_TEST_URL).run(TENANT_DB_NAME);
    await new TenantSeederAdapter(MASTER_TEST_URL).seed(TENANT_DB_NAME);

    prismaService = new PrismaService(MASTER_TEST_URL);
    tenantClient = prismaService.getTenantClient(TENANT_DB_NAME);
    tenantContext = new TenantContext();

    const ticketRepo = new PrismaTicketRepository(tenantContext);
    const operacionRepo = new PrismaOperacionTicketRepository(tenantContext);
    const estadoRepo = new PrismaEstadoRepository(tenantContext);
    const tipoTicketRepo = new PrismaTipoTicketRepository(tenantContext);
    const prioridadRepo = new PrismaPrioridadRepository(tenantContext);
    const tipoOperacionRepo = new PrismaTipoOperacionRepository(tenantContext);
    const cicloRepo = new PrismaCicloClienteRepository(tenantContext);
    const txRunner = new PrismaTenantTransactionRunner(tenantContext, { error: () => {} });

    // El doble implementa el puerto COMPLETO: los otros dos métodos no los usa
    // esta orquestación, pero declararlos evita el cast que los tapaba.
    usuarioMasterChecker = {
      existeEnTenant: vi.fn<(u: string, c: string) => Promise<boolean>>().mockResolvedValue(true),
      estaActivoEnTenant: vi
        .fn<(u: string, c: string) => Promise<boolean>>()
        .mockResolvedValue(true),
      resolverNombres: vi.fn().mockResolvedValue(new Map()),
      getAutorizacionModulos: vi.fn().mockResolvedValue({ esAdminTotal: false, modulos: [] }),
      listarTecnicosAsignables: vi.fn().mockResolvedValue([]),
    };

    crearTicketUseCase = new CrearTicketUseCase(
      ticketRepo,
      operacionRepo,
      estadoRepo,
      tipoTicketRepo,
      prioridadRepo,
      tipoOperacionRepo,
      usuarioMasterChecker,
      new NumeradorTicket(ticketRepo),
      new ResolverCicloActivoParaCreacion(cicloRepo),
      { resolver: async () => null },
      new NoopDomainEventPublisher(),
      txRunner,
    );

    planRepo = new PrismaPlanPreventivoRepository(tenantContext);
    generacionRepo = new PrismaPreventivoGeneracionRepository(tenantContext);
    logger = { error: vi.fn<(mensaje: string) => void>() };

    eventPublisher = new RecordingDomainEventPublisher();
    // Doble mínimo (WU-2): los planes de este spec fijan `ubicacion`, nunca
    // `equipoId` (línea "DEPOSITO PREVENTIVO TEST" abajo), así que
    // `findById` nunca se invoca — no vale montar un repo Prisma real de
    // equipos para una dependencia que este spec no ejercita.
    const equipoRepo: Pick<IEquipoInformaticoRepository, 'findById'> = {
      findById: async () => null,
    };

    generarPreventivosUseCase = new GenerarPreventivosUseCase(
      planRepo,
      generacionRepo,
      tipoTicketRepo,
      crearTicketUseCase,
      txRunner,
      new CalcularCicloService(),
      logger,
      eventPublisher,
      equipoRepo,
    );

    const prioridad = await tenantClient.prioridad.findUniqueOrThrow({
      where: { codigo: 'MEDIA' },
    });
    prioridadId = prioridad.id;

    const tipoPreventivo = await tenantClient.tipoTicket.findUniqueOrThrow({
      where: { codigo: 'PREVENTIVO' },
    });
    tipoPreventivoId = tipoPreventivo.id;

    await tenantClient.cicloCliente.create({
      data: {
        cicloVigenteId: '01900000-0000-7000-8000-000000000001',
        nombre: 'Preventivo GEN E2E Ciclo Activo',
        fechaInicio: restarDias(medianocheHoy(), 365),
        fechaFin: new Date('2099-12-31'),
        activo: true,
      },
    });
  }, 60_000);

  afterEach(() => {
    usuarioMasterChecker.existeEnTenant.mockReset().mockResolvedValue(true);
    logger.error.mockReset();
    eventPublisher.publicados.length = 0;
  });

  afterAll(async () => {
    await prismaService.onModuleDestroy();
    await admin.dropDatabase(TENANT_DB_NAME);
  }, 30_000);

  async function ticketsDelPlan(plan: PlanPreventivoEntity) {
    return tenantClient.ticket.findMany({ where: { titulo: plan.titulo } });
  }

  async function generacionesDelPlan(plan: PlanPreventivoEntity) {
    return tenantClient.preventivoGeneracion.findMany({ where: { planId: plan.id } });
  }

  it('[CRITICAL][R6] doble invocación consecutiva → exactamente 1 ticket PRE- y 1 fila GENERADO', async () => {
    const plan = await crearPlan();

    await withTenant(() => generarPreventivosUseCase.execute(CLIENTE_ID));
    await withTenant(() => generarPreventivosUseCase.execute(CLIENTE_ID));

    const tickets = await ticketsDelPlan(plan);
    const generaciones = await generacionesDelPlan(plan);

    expect(tickets).toHaveLength(1);
    expect(tickets[0].numero.startsWith('PRE-')).toBe(true);
    expect(generaciones).toHaveLength(1);
    expect(generaciones[0].resultado).toBe('GENERADO');
    expect(generaciones[0].ticketId).toBe(tickets[0].id);

    const planActualizado = await withTenant(() => planRepo.buscarPorId(plan.id));
    expect(planActualizado!.proximaEjecucionEn.getTime()).toBeGreaterThan(
      plan.proximaEjecucionEn.getTime(),
    );
  });

  it('[CRITICAL][R11] publica preventivo.generado con el runner REAL de Prisma, DESPUÉS del commit — una sola vez pese a la segunda invocación idempotente', async () => {
    const plan = await crearPlan();

    await withTenant(() => generarPreventivosUseCase.execute(CLIENTE_ID));

    const tickets = await ticketsDelPlan(plan);
    expect(eventPublisher.publicados).toHaveLength(1);
    expect(eventPublisher.publicados[0]).toMatchObject({
      name: 'preventivo.generado',
      planId: plan.id,
      ticketId: tickets[0].id,
      responsableId: plan.responsableId,
    });

    // Idempotencia [R6]: la segunda corrida no reserva de nuevo → tampoco
    // publica de nuevo.
    await withTenant(() => generarPreventivosUseCase.execute(CLIENTE_ID));
    expect(eventPublisher.publicados).toHaveLength(1);
  });

  it('[CRITICAL][R6] dos invocaciones CONCURRENTES → mismo resultado: 1 ticket, 1 fila GENERADO', async () => {
    const plan = await crearPlan();

    await Promise.all([
      withTenant(() => generarPreventivosUseCase.execute(CLIENTE_ID)),
      withTenant(() => generarPreventivosUseCase.execute(CLIENTE_ID)),
    ]);

    const tickets = await ticketsDelPlan(plan);
    const generaciones = await generacionesDelPlan(plan);

    expect(tickets).toHaveLength(1);
    expect(generaciones).toHaveLength(1);
    expect(generaciones[0].resultado).toBe('GENERADO');
  });

  it('[R7] puntero atrasado 4 ciclos (cadencia semanal) → 1 ticket + 3 SALTEADO_ATRASO + puntero > hoy', async () => {
    const mediaNoche = medianocheHoy();
    const anclaAtrasada = restarDias(mediaNoche, 21);
    const plan = await crearPlan({
      fechaInicio: anclaAtrasada,
      proximaEjecucionEn: anclaAtrasada,
    });

    await withTenant(() => generarPreventivosUseCase.execute(CLIENTE_ID));

    const tickets = await ticketsDelPlan(plan);
    const generaciones = await generacionesDelPlan(plan);

    expect(tickets).toHaveLength(1);
    expect(generaciones).toHaveLength(4);
    expect(generaciones.filter((g) => g.resultado === 'SALTEADO_ATRASO')).toHaveLength(3);
    expect(generaciones.filter((g) => g.resultado === 'GENERADO')).toHaveLength(1);

    const planActualizado = await withTenant(() => planRepo.buscarPorId(plan.id));
    expect(planActualizado!.proximaEjecucionEn.getTime()).toBeGreaterThan(new Date().getTime());
  });

  it('[R7] caso patológico (atraso > TOPE, cadencia diaria) → UNA sola fila de salteo, re-ancla, SIN ticket', async () => {
    const anclaMuyVieja = restarDias(medianocheHoy(), 400);
    const plan = await crearPlan({
      fechaInicio: anclaMuyVieja,
      proximaEjecucionEn: anclaMuyVieja,
      intervaloValor: 1,
      intervaloUnidad: 'DIAS',
    });

    await withTenant(() => generarPreventivosUseCase.execute(CLIENTE_ID));

    const tickets = await ticketsDelPlan(plan);
    const generaciones = await generacionesDelPlan(plan);

    expect(tickets).toHaveLength(0);
    expect(generaciones).toHaveLength(1);
    expect(generaciones[0].resultado).toBe('SALTEADO_ATRASO');
    expect(eventPublisher.publicados).toHaveLength(0);

    const planActualizado = await withTenant(() => planRepo.buscarPorId(plan.id));
    // Re-anclaje aritmético: el puntero saltó cerca de "hoy", NUNCA ciclo a
    // ciclo desde el ancla vieja (eso hubiera tardado ~400 pasos).
    expect(planActualizado!.proximaEjecucionEn.getTime()).toBeGreaterThan(
      restarDias(medianocheHoy(), 2).getTime(),
    );
  });

  it('[R4] plan dado de baja (activo=false) con ciclo vencido → no genera nada, NO publica preventivo.generado', async () => {
    const plan = await crearPlan({ activo: false });

    await withTenant(() => generarPreventivosUseCase.execute(CLIENTE_ID));

    expect(await ticketsDelPlan(plan)).toHaveLength(0);
    expect(await generacionesDelPlan(plan)).toHaveLength(0);
    expect(eventPublisher.publicados).toHaveLength(0);
  });

  it('[R8] preventivo abierto sin atender → SALTEADO_PENDIENTE, NO genera un segundo ticket, NO publica preventivo.generado', async () => {
    const mediaNoche = medianocheHoy();
    const plan = await crearPlan({ fechaInicio: mediaNoche, proximaEjecucionEn: mediaNoche });

    // Historial: un ciclo previo YA generó un ticket que sigue abierto (NUEVO).
    const cicloAnterior = restarDias(mediaNoche, 7);
    const ticketAbiertoResult = await withTenant(() =>
      crearTicketUseCase.execute({
        titulo: plan.titulo,
        descripcion: null,
        tipoId: tipoPreventivoId,
        prioridadId,
        solicitanteId: DUMMY_RESPONSABLE_ID,
        clienteId: CLIENTE_ID,
        autorId: DUMMY_RESPONSABLE_ID,
        anio: mediaNoche.getUTCFullYear(),
      }),
    );
    const ticketAbierto = ticketAbiertoResult.getValue();
    const generacionPreviaId = await withTenant(() =>
      generacionRepo.reservar(plan.id, cicloAnterior),
    );
    await withTenant(() => generacionRepo.marcarGenerado(generacionPreviaId!, ticketAbierto.id));

    await withTenant(() => generarPreventivosUseCase.execute(CLIENTE_ID));

    const tickets = await ticketsDelPlan(plan);
    const generaciones = await generacionesDelPlan(plan);

    // El único ticket sigue siendo el histórico — nada nuevo se creó.
    expect(tickets).toHaveLength(1);
    expect(tickets[0].id).toBe(ticketAbierto.id);
    expect(generaciones).toHaveLength(2);
    const filaCicloActual = generaciones.find(
      (g) => g.fechaProgramada.getTime() === mediaNoche.getTime(),
    );
    expect(filaCicloActual!.resultado).toBe('SALTEADO_PENDIENTE');
    expect(filaCicloActual!.ticketId).toBeNull();
    // El ticket histórico (creado a mano arriba, fuera del use case bajo
    // prueba) SÍ dispara su propio TicketCreadoEvent vía NoopDomainEventPublisher
    // — irrelevante acá. Lo que importa es que ESTA corrida, que solo generó
    // un SALTEADO_PENDIENTE, no agregó ningún preventivo.generado.
    expect(eventPublisher.publicados).toHaveLength(0);

    const planActualizado = await withTenant(() => planRepo.buscarPorId(plan.id));
    expect(planActualizado!.proximaEjecucionEn.getTime()).toBeGreaterThan(mediaNoche.getTime());
  });

  it('[CRITICAL][R9] fallo al crear el ticket (responsable inválido) → CERO filas RESERVADO, puntero SIN mover — RESERVADO nunca queda committeado, y NO publica preventivo.generado', async () => {
    const plan = await crearPlan();
    usuarioMasterChecker.existeEnTenant.mockResolvedValueOnce(false);

    await withTenant(() => generarPreventivosUseCase.execute(CLIENTE_ID));

    expect(await ticketsDelPlan(plan)).toHaveLength(0);
    const generaciones = await generacionesDelPlan(plan);
    expect(generaciones).toHaveLength(0);
    expect(eventPublisher.publicados).toHaveLength(0);

    const planActualizado = await withTenant(() => planRepo.buscarPorId(plan.id));
    expect(planActualizado!.proximaEjecucionEn.getTime()).toBe(plan.proximaEjecucionEn.getTime());
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining(plan.id));
  });
});
