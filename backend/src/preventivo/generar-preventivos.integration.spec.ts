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
import { PrismaReglaAsignacionRepository } from '../tickets/infrastructure/persistence/prisma/prisma-regla-asignacion.repository';
import { ResolverAsignacionAutomatica } from '../tickets/application/services/resolver-asignacion-automatica.service';
import { ElegibilidadAsignado } from '../tickets/application/services/elegibilidad-asignado';
import { PrismaPermisoTipoTicketRepository } from '../tickets/infrastructure/persistence/prisma/prisma-permiso-tipo-ticket.repository';
import { CrearTicketUseCase } from '../tickets/application/use-cases/crear-ticket.use-case';
import { IUsuarioMasterChecker } from '../tickets/domain/ports/i-usuario-master.checker';

import { PrismaPlanPreventivoRepository } from './infrastructure/persistence/prisma/prisma-plan-preventivo.repository';
import { PrismaPreventivoGeneracionRepository } from './infrastructure/persistence/prisma/prisma-preventivo-generacion.repository';
import { PlanPreventivoEntity } from './domain/entities/plan-preventivo.entity';
import { CalcularCicloService } from './domain/services/calcular-ciclo.service';
import { GenerarPreventivosUseCase } from './application/use-cases/generar-preventivos.use-case';
import { EnviarRecordatoriosPreventivoUseCase } from './application/use-cases/enviar-recordatorios-preventivo.use-case';
import { PreventivoRecordatorioEvent } from './domain/events/preventivo-recordatorio.event';
import { diaArgentino } from '../shared/domain/zona-horaria-argentina';
import { IEquipoInformaticoRepository } from '../equipos/domain/ports/i-equipo-informatico.repository';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';

const TENANT_DB_NAME = `soporte_prov_prevGenE2E_${randomBytes(4).toString('hex')}_test`;
const CLIENTE_ID = 'prev-gen-e2e-cliente';
const DUMMY_RESPONSABLE_ID = '01900000-0000-7000-8000-000000000101';
const RESPONSABLE_REGLA_ID = '01900000-0000-7000-8000-000000000102';

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
  let enviarRecordatorios: EnviarRecordatoriosPreventivoUseCase;
  let recordatorioPublisher: RecordingDomainEventPublisher;
  let ticketEventPublisher: RecordingDomainEventPublisher;
  let reglaRepo: PrismaReglaAsignacionRepository;
  let usuarioMasterChecker: IUsuarioMasterChecker & {
    existeEnTenant: ReturnType<typeof vi.fn<(u: string, c: string) => Promise<boolean>>>;
    listarAgentes: ReturnType<typeof vi.fn<IUsuarioMasterChecker['listarAgentes']>>;
  };
  let logger: {
    error: ReturnType<typeof vi.fn<(mensaje: string) => void>>;
    log: ReturnType<typeof vi.fn<(mensaje: string) => void>>;
  };

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
      listarAgentes: vi.fn<IUsuarioMasterChecker['listarAgentes']>().mockResolvedValue([]),
    };

    reglaRepo = new PrismaReglaAsignacionRepository(tenantContext);
    ticketEventPublisher = new RecordingDomainEventPublisher();
    logger = { error: vi.fn<(mensaje: string) => void>(), log: vi.fn<(mensaje: string) => void>() };

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
      new ResolverAsignacionAutomatica(
        reglaRepo,
        // Elegibilidad real: la LECTURA sobre el tipo se lee del tenant, dentro de la tx del plan.
        new ElegibilidadAsignado(
          usuarioMasterChecker,
          new PrismaPermisoTipoTicketRepository(tenantContext),
        ),
        estadoRepo,
        tipoOperacionRepo,
        logger,
      ),
      ticketEventPublisher,
      txRunner,
    );

    planRepo = new PrismaPlanPreventivoRepository(tenantContext);
    generacionRepo = new PrismaPreventivoGeneracionRepository(tenantContext);

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

    recordatorioPublisher = new RecordingDomainEventPublisher();
    enviarRecordatorios = new EnviarRecordatoriosPreventivoUseCase(
      generacionRepo,
      txRunner,
      recordatorioPublisher,
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

  afterEach(async () => {
    usuarioMasterChecker.existeEnTenant.mockReset().mockResolvedValue(true);
    usuarioMasterChecker.listarAgentes.mockReset().mockResolvedValue([]);
    logger.error.mockReset();
    logger.log.mockReset();
    eventPublisher.publicados.length = 0;
    ticketEventPublisher.publicados.length = 0;
    recordatorioPublisher.publicados.length = 0;
    await withTenant(() => reglaRepo.quitar(tipoPreventivoId));
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
        alcance: null,
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
    // prueba) SÍ dispara su propio TicketCreadoEvent vía el publisher de tickets
    // — irrelevante acá. Lo que importa es que ESTA corrida, que solo generó
    // un SALTEADO_PENDIENTE, no agregó ningún preventivo.generado.
    expect(eventPublisher.publicados).toHaveLength(0);

    const planActualizado = await withTenant(() => planRepo.buscarPorId(plan.id));
    expect(planActualizado!.proximaEjecucionEn.getTime()).toBeGreaterThan(mediaNoche.getTime());
  });

  // ─── Anticipación (odd/preventivo-anticipacion T2) ──────────────────────
  describe('anticipación: generación antes de la fecha del ciclo (S1, S2)', () => {
    function sumarDias(fecha: Date, dias: number): Date {
      return restarDias(fecha, -dias);
    }

    it('con 5 días de anticipación genera HOY el ciclo de dentro de 5 días, con esa fecha como objetivo, y no duplica', async () => {
      const ciclo = sumarDias(medianocheHoy(), 5);
      const plan = await crearPlan({
        intervaloValor: 30,
        intervaloUnidad: 'DIAS',
        anticipacionValor: 5,
        anticipacionUnidad: 'DIAS',
        fechaInicio: ciclo,
        proximaEjecucionEn: ciclo,
      });

      await withTenant(() => generarPreventivosUseCase.execute(CLIENTE_ID));
      await withTenant(() => generarPreventivosUseCase.execute(CLIENTE_ID));

      const tickets = await ticketsDelPlan(plan);
      const generaciones = await generacionesDelPlan(plan);
      expect(tickets).toHaveLength(1);
      expect(tickets[0].fechaObjetivo).toEqual(ciclo);
      // La clave de idempotencia sigue siendo la fecha del CICLO, no la de generación.
      expect(generaciones).toHaveLength(1);
      expect(generaciones[0].fechaProgramada).toEqual(ciclo);
      expect(generaciones[0].resultado).toBe('GENERADO');
      expect(eventPublisher.publicados).toHaveLength(1);

      const planActualizado = await withTenant(() => planRepo.buscarPorId(plan.id));
      expect(planActualizado?.proximaEjecucionEn).toEqual(sumarDias(ciclo, 30));
    });

    it('hermano: con 4 días de anticipación, el ciclo de dentro de 5 días todavía no se genera', async () => {
      const ciclo = sumarDias(medianocheHoy(), 5);
      const plan = await crearPlan({
        intervaloValor: 30,
        intervaloUnidad: 'DIAS',
        anticipacionValor: 4,
        anticipacionUnidad: 'DIAS',
        fechaInicio: ciclo,
        proximaEjecucionEn: ciclo,
      });

      await withTenant(() => generarPreventivosUseCase.execute(CLIENTE_ID));

      expect(await ticketsDelPlan(plan)).toHaveLength(0);
      expect(await generacionesDelPlan(plan)).toHaveLength(0);
      const planActualizado = await withTenant(() => planRepo.buscarPorId(plan.id));
      expect(planActualizado?.proximaEjecucionEn).toEqual(ciclo);
    });

    it('[R8] con anticipación, un preventivo anterior abierto saltea el ciclo, registrado con la fecha del ciclo', async () => {
      const ciclo = sumarDias(medianocheHoy(), 3);
      const plan = await crearPlan({
        intervaloValor: 7,
        intervaloUnidad: 'DIAS',
        anticipacionValor: 3,
        anticipacionUnidad: 'DIAS',
        fechaInicio: restarDias(ciclo, 7),
        proximaEjecucionEn: ciclo,
      });
      const abierto = (
        await withTenant(() =>
          crearTicketUseCase.execute({
            titulo: plan.titulo,
            descripcion: null,
            tipoId: tipoPreventivoId,
            prioridadId,
            solicitanteId: DUMMY_RESPONSABLE_ID,
            clienteId: CLIENTE_ID,
            autorId: DUMMY_RESPONSABLE_ID,
            anio: ciclo.getUTCFullYear(),
            alcance: null,
          }),
        )
      ).getValue();
      const previaId = await withTenant(() =>
        generacionRepo.reservar(plan.id, restarDias(ciclo, 7)),
      );
      if (previaId === null) throw new Error('No se pudo reservar el ciclo previo del fixture.');
      await withTenant(() => generacionRepo.marcarGenerado(previaId, abierto.id));

      await withTenant(() => generarPreventivosUseCase.execute(CLIENTE_ID));

      expect(await ticketsDelPlan(plan)).toHaveLength(1);
      const fila = (await generacionesDelPlan(plan)).find(
        (g) => g.fechaProgramada.getTime() === ciclo.getTime(),
      );
      expect(fila?.resultado).toBe('SALTEADO_PENDIENTE');
      expect(eventPublisher.publicados).toHaveLength(0);
    });
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

  describe('regla de asignación automática en el preventivo (A6, A7, A9, N1)', () => {
    async function conRegla() {
      await withTenant(() =>
        reglaRepo.fijar(tipoPreventivoId, RESPONSABLE_REGLA_ID, DUMMY_RESPONSABLE_ID),
      );
      // El responsable atiende el tipo del preventivo (odd/permisos-por-tipo-ticket, D5 g).
      await tenantClient.permisoTipoTicket.createMany({
        data: [{ usuarioId: RESPONSABLE_REGLA_ID, tipoId: tipoPreventivoId, accion: 'LECTURA' }],
        skipDuplicates: true,
      });
      usuarioMasterChecker.listarAgentes.mockResolvedValue([
        { id: RESPONSABLE_REGLA_ID, nombre: 'Tina', apellido: 'Tecnica' },
      ]);
    }

    // El barrido procesa TODOS los planes vencidos del tenant (los de tests anteriores también).
    const nombresDe = (ticketId: string) =>
      ticketEventPublisher.publicados
        .filter((e) => 'ticketId' in e && e.ticketId === ticketId)
        .map((e) => e.name);

    it('aplica la regla dentro de la transacción del plan: ticket ASIGNADO y ticket.asignado post-commit', async () => {
      await conRegla();
      const plan = await crearPlan();

      await withTenant(() => generarPreventivosUseCase.execute(CLIENTE_ID));

      const [ticket] = await ticketsDelPlan(plan);
      expect(ticket.asignadoId).toBe(RESPONSABLE_REGLA_ID);
      const asignado = await tenantClient.estado.findUniqueOrThrow({
        where: { codigo: 'ASIGNADO' },
      });
      expect(ticket.estadoId).toBe(asignado.id);
      expect(nombresDe(ticket.id)).toEqual(['ticket.creado', 'ticket.asignado']);
      expect(await generacionesDelPlan(plan)).toHaveLength(1);
    });

    it('un fallo del maestro al evaluar la regla no aborta el plan: el ticket nace NUEVO y sin asignar', async () => {
      await conRegla();
      usuarioMasterChecker.listarAgentes.mockRejectedValue(new Error('master caido'));
      const plan = await crearPlan();

      await withTenant(() => generarPreventivosUseCase.execute(CLIENTE_ID));

      const [ticket] = await ticketsDelPlan(plan);
      expect(ticket.asignadoId).toBeNull();
      expect(await generacionesDelPlan(plan)).toHaveLength(1);
      expect(nombresDe(ticket.id)).toEqual(['ticket.creado']);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('ASIGNACION_AUTOMATICA_DEGRADADA'),
      );
    });

    it('un fallo forzado del plan después de crear el ticket → ROLLBACK total y ningún ticket.asignado', async () => {
      await conRegla();
      const plan = await crearPlan();
      const spy = vi
        .spyOn(generacionRepo, 'marcarGenerado')
        .mockRejectedValue(new Error('fallo forzado del plan'));

      try {
        await withTenant(() => generarPreventivosUseCase.execute(CLIENTE_ID));
      } finally {
        spy.mockRestore();
      }

      expect(await ticketsDelPlan(plan)).toHaveLength(0);
      expect(await generacionesDelPlan(plan)).toHaveLength(0);
      expect(ticketEventPublisher.publicados).toHaveLength(0);
    });
  });

  // ─── Recordatorio 1 día antes (odd/preventivo-anticipacion T3, S4) ───────
  describe('recordatorio 1 día antes de la fecha objetivo (S4)', () => {
    const MS_DIA = 24 * 60 * 60 * 1000;

    /**
     * Ticket preventivo GENERADO por `plan`, con `fechaObjetivo`, y con
     * `created_at` corrido `diasAtras` días (0 = generado hoy).
     */
    async function ticketPreventivo(
      plan: PlanPreventivoEntity,
      fechaObjetivo: Date,
      diasAtras: number,
    ): Promise<string> {
      const ticket = (
        await withTenant(() =>
          crearTicketUseCase.execute({
            titulo: plan.titulo,
            descripcion: null,
            tipoId: tipoPreventivoId,
            prioridadId,
            solicitanteId: DUMMY_RESPONSABLE_ID,
            clienteId: CLIENTE_ID,
            autorId: DUMMY_RESPONSABLE_ID,
            anio: fechaObjetivo.getUTCFullYear(),
            fechaObjetivo,
            alcance: null,
          }),
        )
      ).getValue();
      const generacionId = await withTenant(() => generacionRepo.reservar(plan.id, fechaObjetivo));
      if (generacionId === null) throw new Error('No se pudo reservar el ciclo del fixture.');
      await withTenant(() => generacionRepo.marcarGenerado(generacionId, ticket.id));
      await tenantClient.ticket.update({
        where: { id: ticket.id },
        data: { createdAt: new Date(Date.now() - diasAtras * MS_DIA) },
      });
      return ticket.id;
    }

    function recordatoriosDe(ticketId: string): PreventivoRecordatorioEvent[] {
      return recordatorioPublisher.publicados.filter(
        (e): e is PreventivoRecordatorioEvent =>
          e instanceof PreventivoRecordatorioEvent && e.ticketId === ticketId,
      );
    }

    async function marcaDe(ticketId: string): Promise<Date | null> {
      const fila = await tenantClient.ticket.findUniqueOrThrow({ where: { id: ticketId } });
      return fila.recordatorioEnviadoAt;
    }

    const manana = (): Date => new Date(diaArgentino(new Date()).getTime() + MS_DIA);

    it('reclama el ticket abierto con fecha objetivo mañana, lo marca, y la segunda corrida no manda nada', async () => {
      const plan = await crearPlan();
      const ticketId = await ticketPreventivo(plan, manana(), 2);

      await withTenant(() => enviarRecordatorios.execute());

      expect(recordatoriosDe(ticketId)).toHaveLength(1);
      expect(recordatoriosDe(ticketId)[0]).toMatchObject({
        planId: plan.id,
        responsableId: DUMMY_RESPONSABLE_ID,
      });
      expect(await marcaDe(ticketId)).not.toBeNull();

      await withTenant(() => enviarRecordatorios.execute());
      expect(recordatoriosDe(ticketId)).toHaveLength(1);
    });

    it('dos barridos CONCURRENTES mandan un solo recordatorio y dejan el ticket marcado', async () => {
      const plan = await crearPlan();
      const ticketId = await ticketPreventivo(plan, manana(), 2);
      const ahora = new Date();

      await Promise.all([
        withTenant(() => enviarRecordatorios.execute(ahora)),
        withTenant(() => enviarRecordatorios.execute(ahora)),
      ]);

      expect(recordatoriosDe(ticketId)).toHaveLength(1);
      expect(await marcaDe(ticketId)).not.toBeNull();
    });

    it('va al responsable ACTUAL del plan, no al que tenía al generarse', async () => {
      const plan = await crearPlan();
      const ticketId = await ticketPreventivo(plan, manana(), 2);
      await tenantClient.planPreventivo.update({
        where: { id: plan.id },
        data: { responsableId: RESPONSABLE_REGLA_ID },
      });

      await withTenant(() => enviarRecordatorios.execute());

      expect(recordatoriosDe(ticketId)[0]?.responsableId).toBe(RESPONSABLE_REGLA_ID);
    });

    it.each(['RESUELTO', 'CERRADO', 'CANCELADO'])(
      'un ticket en %s no recibe recordatorio ni queda marcado',
      async (codigo) => {
        const plan = await crearPlan();
        const ticketId = await ticketPreventivo(plan, manana(), 2);
        const estado = await tenantClient.estado.findUniqueOrThrow({ where: { codigo } });
        await tenantClient.ticket.update({
          where: { id: ticketId },
          data: { estadoId: estado.id },
        });

        await withTenant(() => enviarRecordatorios.execute());

        expect(recordatoriosDe(ticketId)).toHaveLength(0);
        expect(await marcaDe(ticketId)).toBeNull();
      },
    );

    it('un ticket borrado no recibe recordatorio', async () => {
      const plan = await crearPlan();
      const ticketId = await ticketPreventivo(plan, manana(), 2);
      await tenantClient.ticket.update({
        where: { id: ticketId },
        data: { deletedAt: new Date() },
      });

      await withTenant(() => enviarRecordatorios.execute());

      expect(recordatoriosDe(ticketId)).toHaveLength(0);
      expect(await marcaDe(ticketId)).toBeNull();
    });

    it('un ticket generado HOY no recibe recordatorio: ya le llegó el correo de generación', async () => {
      const plan = await crearPlan();
      const ticketId = await ticketPreventivo(plan, manana(), 0);

      await withTenant(() => enviarRecordatorios.execute());

      expect(recordatoriosDe(ticketId)).toHaveLength(0);
      expect(await marcaDe(ticketId)).toBeNull();
    });

    it('hermano: con fecha objetivo pasado mañana todavía no es el día del recordatorio', async () => {
      const plan = await crearPlan();
      const ticketId = await ticketPreventivo(plan, new Date(manana().getTime() + MS_DIA), 2);

      await withTenant(() => enviarRecordatorios.execute());

      expect(recordatoriosDe(ticketId)).toHaveLength(0);
      expect(await marcaDe(ticketId)).toBeNull();
    });

    it('un ticket con fecha objetivo que NO salió de un plan no recibe recordatorio', async () => {
      const ticket = (
        await withTenant(() =>
          crearTicketUseCase.execute({
            titulo: `SUELTO_${RUN_PREFIX}`,
            descripcion: null,
            tipoId: tipoPreventivoId,
            prioridadId,
            solicitanteId: DUMMY_RESPONSABLE_ID,
            clienteId: CLIENTE_ID,
            autorId: DUMMY_RESPONSABLE_ID,
            anio: manana().getUTCFullYear(),
            fechaObjetivo: manana(),
            alcance: null,
          }),
        )
      ).getValue();
      await tenantClient.ticket.update({
        where: { id: ticket.id },
        data: { createdAt: new Date(Date.now() - 2 * MS_DIA) },
      });

      await withTenant(() => enviarRecordatorios.execute());

      expect(recordatoriosDe(ticket.id)).toHaveLength(0);
    });
  });
});
