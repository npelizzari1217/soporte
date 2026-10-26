/**
 * [INTEGRATION] Tramos del técnico contra Postgres REAL (odd/tasks/tiempo-tecnico.md, T3, S2,
 * S4-S7), en un tenant efímero migrado y sembrado.
 *
 * Cada vía que cambia el responsable o el estado de un ticket guarda por
 * `TicketRepositoryConTramos` (el `TICKET_REPOSITORY` del módulo): el alta con regla, la asignación
 * manual, asignar y poner en proceso, el avance por tareas y las transiciones. Para cada una se
 * verifica que el tramo se abre o se cierra, y que un rollback de la transacción no deja tramos
 * huérfanos ni cierres a medias. El alta de equipos y la de edilicia usan el mismo repositorio y el
 * mismo armado que el alta de tickets; lo fija la guarda `escritores-asignado.spec.ts`.
 *
 * Además, con el reloj del servicio controlado: la medición en el horario propio del técnico o, sin
 * él, en el del tenant, descontando la espera al cliente leída del historial real.
 *
 * Master es un doble (`IUsuarioMasterChecker`) y los feriados también: este spec no puebla master.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from '../shared/infrastructure/persistence/prisma.service';
import { TenantContext } from '../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../shared/infrastructure/persistence/prisma-clients';
import { PrismaTenantTransactionRunner } from '../shared/infrastructure/persistence/tenant-transaction-runner';
import { PostgresAdminService } from '../clientes/infrastructure/postgres-admin.service';
import { TenantMigrationRunnerAdapter } from '../clientes/infrastructure/tenant-migration-runner.adapter';
import { TenantSeederAdapter } from '../clientes/infrastructure/tenant-seeder.adapter';
import { CalcularSlaHabilVenceService } from '../calendario-laboral/domain/services/calcular-sla-habil-vence.service';
import { ResolverHorarioLaboralUsuarioService } from '../calendario-laboral/domain/services/resolver-horario-laboral-usuario.service';
import { PrismaHorarioLaboralUsuarioRepository } from '../calendario-laboral/infrastructure/persistence/prisma/prisma-horario-laboral-usuario.repository';
import { PrismaCalendarioLaboralSemanalRepository } from '../calendario-laboral/infrastructure/persistence/prisma/prisma-calendario-laboral-semanal.repository';
import { TicketEntity } from '../tickets/domain/entities/ticket.entity';
import { OperacionTicketEntity } from '../tickets/domain/entities/operacion-ticket.entity';
import { IUsuarioMasterChecker } from '../tickets/domain/ports/i-usuario-master.checker';
import { IOperacionTicketRepository } from '../tickets/domain/ports/i-operacion-ticket.repository';
import { NumeradorTicket } from '../tickets/domain/services/numerador-ticket.service';
import { TicketStateMachineFactory } from '../tickets/domain/state-machine/ticket-state-machine.factory';
import { PrismaTicketRepository } from '../tickets/infrastructure/persistence/prisma/prisma-ticket.repository';
import { PrismaOperacionTicketRepository } from '../tickets/infrastructure/persistence/prisma/prisma-operacion-ticket.repository';
import { PrismaEstadoRepository } from '../tickets/infrastructure/persistence/prisma/prisma-estado.repository';
import { PrismaTipoTicketRepository } from '../tickets/infrastructure/persistence/prisma/prisma-tipo-ticket.repository';
import { PrismaPrioridadRepository } from '../tickets/infrastructure/persistence/prisma/prisma-prioridad.repository';
import { PrismaTipoOperacionRepository } from '../tickets/infrastructure/persistence/prisma/prisma-tipo-operacion.repository';
import { PrismaCicloClienteRepository } from '../tickets/infrastructure/persistence/prisma/prisma-ciclo-cliente.repository';
import { PrismaRelojSlaMarcador } from '../tickets/infrastructure/persistence/prisma/prisma-reloj-sla-marcador';
import { ResolverCicloActivoParaCreacion } from '../tickets/application/services/resolver-ciclo-activo.service';
import { AvanzarEstadoPorTareasService } from '../tickets/application/services/avanzar-estado-por-tareas.service';
import { CrearTicketUseCase } from '../tickets/application/use-cases/crear-ticket.use-case';
import { AsignarTicketUseCase } from '../tickets/application/use-cases/asignar-ticket.use-case';
import { AsignarYPonerEnProcesoUseCase } from '../tickets/application/use-cases/asignar-y-poner-en-proceso.use-case';
import { TransicionarEstadoUseCase } from '../tickets/application/use-cases/transicionar-estado.use-case';
import { SincronizarTramoTecnicoService } from './application/sincronizar-tramo-tecnico.service';
import { TramoTecnico } from './domain/ports/i-tramo-tecnico.repository';
import { PrismaTramoTecnicoRepository } from './infrastructure/prisma-tramo-tecnico.repository';
import { TicketRepositoryConTramos } from './infrastructure/ticket-repository-con-tramos';

const MASTER_TEST_URL =
  process.env.DATABASE_URL_MASTER ??
  'postgresql://soporte:soporte@localhost:5432/soporte_master_test';
const DB = `soporte_prov_tramos_${randomBytes(4).toString('hex')}_test`;
const CLIENTE_ID = 'tramos-tecnico-cliente';
const SOLICITANTE = '01900000-0000-7000-8000-000000000c01';
const ANA = '01900000-0000-7000-8000-000000000c0a';
const BETO = '01900000-0000-7000-8000-000000000c0b';
const META_S = 4 * 3600;

class RollbackIntencional extends Error {}

/** Instante en hora argentina (UTC-3). El 2026-10-26 es lunes. */
const art = (fechaHora: string): Date => new Date(`${fechaHora}:00-03:00`);

describe('Tramos del técnico — integración por vía de escritura del ticket', () => {
  const admin = new PostgresAdminService(MASTER_TEST_URL);
  let prismaService: PrismaService;
  let client: InstanceType<typeof TenantPrismaClient>;
  let tenantContext: TenantContext;
  let txRunner: PrismaTenantTransactionRunner;
  let tramoRepo: PrismaTramoTecnicoRepository;
  let ticketRepo: TicketRepositoryConTramos;
  let operacionRepo: PrismaOperacionTicketRepository;
  let estadoRepo: PrismaEstadoRepository;
  let tipoTicketRepo: PrismaTipoTicketRepository;
  let tipoOperacionRepo: PrismaTipoOperacionRepository;
  let ids: {
    tipo: string;
    prioridad: string;
    estados: Record<string, string>;
    cambioEstado: string;
  };
  let contador = 0;
  let reloj = new Date();

  const withTenant = <T>(fn: () => Promise<T>): Promise<T> =>
    tenantContext.run({ prismaClient: client, dbName: DB, clienteId: CLIENTE_ID }, fn);

  const checker: IUsuarioMasterChecker = {
    existeEnTenant: async () => true,
    estaActivoEnTenant: async () => true,
    resolverNombres: async () => new Map(),
    listarAgentes: async () => [],
  };
  const elegibilidad = {
    aceptaComoResponsable: async () => true,
    esAgenteDeTipo: async () => true,
  };
  const publisher = { publish: () => undefined };

  /** Servicio real; `ahora` lo fija cada test de medición (los demás usan la hora real). */
  function servicio(ahora: () => Date = () => new Date()): SincronizarTramoTecnicoService {
    return new SincronizarTramoTecnicoService(
      tramoRepo,
      new ResolverHorarioLaboralUsuarioService(
        new PrismaHorarioLaboralUsuarioRepository(tenantContext),
        new PrismaCalendarioLaboralSemanalRepository(tenantContext),
      ),
      {
        obtenerGlobales: async () => new Set<string>(),
        obtenerPropios: async () => new Set<string>(),
      },
      new CalcularSlaHabilVenceService(),
      { error: () => undefined },
      ahora,
    );
  }

  const tramos = (ticketId: string): Promise<TramoTecnico[]> =>
    withTenant(() => tramoRepo.listarPorTicket(ticketId));
  const resumen = async (ticketId: string) =>
    (await tramos(ticketId)).map((t) => ({
      tecnicoId: t.tecnicoId,
      abierto: t.finAt === null,
      motivoFin: t.motivoFin,
      metaS: t.metaS,
      cumplido: t.cumplido,
    }));

  /** Ticket en el estado dado, guardado SIN tramos (como uno de antes del deploy). */
  async function ticketPrevio(
    estado: string,
    asignadoId: string | null = null,
    slaMetaS: number = META_S,
  ): Promise<string> {
    contador += 1;
    const ticket = TicketEntity.create({
      numero: `TRAMOS-${contador}`,
      titulo: `Tramos ${contador}`,
      descripcion: null,
      tipoId: ids.tipo,
      estadoId: ids.estados[estado],
      prioridadId: ids.prioridad,
      cicloId: null,
      ticketReferenciaId: null,
      solicitanteId: SOLICITANTE,
    });
    ticket.assignTo(asignadoId);
    await withTenant(() => new PrismaTicketRepository(tenantContext).save(ticket));
    await client.ticket.update({ where: { id: ticket.id }, data: { slaMetaS } });
    return ticket.id;
  }

  const estadoDe = async (ticketId: string): Promise<string> =>
    (
      await client.ticket.findUniqueOrThrow({
        where: { id: ticketId },
        select: { estado: { select: { codigo: true } } },
      })
    ).estado.codigo;

  function asignar(): AsignarTicketUseCase {
    return new AsignarTicketUseCase(
      ticketRepo,
      operacionRepo,
      checker,
      elegibilidad,
      tipoOperacionRepo,
      txRunner,
      estadoRepo,
      publisher,
    );
  }

  function transicionar(
    operaciones: IOperacionTicketRepository = operacionRepo,
  ): TransicionarEstadoUseCase {
    return new TransicionarEstadoUseCase(
      ticketRepo,
      operaciones,
      estadoRepo,
      tipoTicketRepo,
      tipoOperacionRepo,
      new TicketStateMachineFactory(),
      publisher,
      txRunner,
      new PrismaRelojSlaMarcador(tenantContext),
    );
  }

  const asignarA = (ticketId: string, asignadoId: string) =>
    withTenant(() =>
      asignar().execute({
        ticketId,
        asignadoId,
        clienteId: CLIENTE_ID,
        autorId: SOLICITANTE,
        actorId: SOLICITANTE,
        permisosPorTipo: null,
      }),
    );

  const pasarA = (
    ticketId: string,
    nuevoEstadoCodigo: string,
    opciones: { corrector?: boolean; operaciones?: IOperacionTicketRepository } = {},
  ) =>
    withTenant(() =>
      transicionar(opciones.operaciones).execute({
        ticketId,
        nuevoEstadoCodigo,
        autorId: SOLICITANTE,
        actorEsCorrector: opciones.corrector ?? false,
        alcance: null,
      }),
    );

  beforeAll(async () => {
    await admin.createDatabase(DB);
    await new TenantMigrationRunnerAdapter(MASTER_TEST_URL).run(DB);
    await new TenantSeederAdapter(MASTER_TEST_URL).seed(DB);
    prismaService = new PrismaService(MASTER_TEST_URL);
    client = prismaService.getTenantClient(DB);
    tenantContext = new TenantContext();
    txRunner = new PrismaTenantTransactionRunner(tenantContext, { error: () => undefined });
    tramoRepo = new PrismaTramoTecnicoRepository(tenantContext);
    ticketRepo = new TicketRepositoryConTramos(
      new PrismaTicketRepository(tenantContext),
      servicio(),
      txRunner,
    );
    operacionRepo = new PrismaOperacionTicketRepository(tenantContext);
    estadoRepo = new PrismaEstadoRepository(tenantContext);
    tipoTicketRepo = new PrismaTipoTicketRepository(tenantContext);
    tipoOperacionRepo = new PrismaTipoOperacionRepository(tenantContext);

    const estados = await client.estado.findMany();
    ids = {
      tipo: (await client.tipoTicket.findUniqueOrThrow({ where: { codigo: 'SOPORTE' } })).id,
      prioridad: (await client.prioridad.findUniqueOrThrow({ where: { codigo: 'MEDIA' } })).id,
      estados: Object.fromEntries(estados.map((e) => [e.codigo, e.id])),
      cambioEstado: (
        await client.tipoOperacion.findUniqueOrThrow({ where: { codigo: 'CAMBIO_ESTADO' } })
      ).id,
    };
    await client.cicloCliente.create({
      data: {
        cicloVigenteId: '01900000-0000-7000-8000-000000000001',
        nombre: 'Tramos del tecnico',
        fechaInicio: new Date('2026-01-01'),
        fechaFin: new Date('2099-12-31'),
        activo: true,
      },
    });
  }, 120_000);

  afterAll(async () => {
    await prismaService.onModuleDestroy();
    await admin.dropDatabase(DB);
  }, 60_000);

  describe('alta con regla de asignación (CrearTicketUseCase)', () => {
    function crear(): CrearTicketUseCase {
      return new CrearTicketUseCase(
        ticketRepo,
        operacionRepo,
        estadoRepo,
        tipoTicketRepo,
        new PrismaPrioridadRepository(tenantContext),
        tipoOperacionRepo,
        checker,
        new NumeradorTicket(ticketRepo),
        new ResolverCicloActivoParaCreacion(new PrismaCicloClienteRepository(tenantContext)),
        {
          resolver: async () => ({
            asignadoId: ANA,
            estadoAsignadoId: ids.estados.ASIGNADO,
            tipoOperacionAsignacionId: (
              await client.tipoOperacion.findUniqueOrThrow({ where: { codigo: 'ASIGNACION' } })
            ).id,
          }),
        },
        publisher,
        txRunner,
      );
    }
    const dto = () => ({
      titulo: `Alta con regla ${++contador}`,
      tipoId: ids.tipo,
      prioridadId: ids.prioridad,
      solicitanteId: SOLICITANTE,
      clienteId: CLIENTE_ID,
      autorId: SOLICITANTE,
      anio: 2026,
      alcance: null,
    });

    it('el ticket nace ASIGNADO con el tramo del responsable abierto', async () => {
      const ticket = (await withTenant(() => crear().execute(dto()))).getValue();

      expect(await resumen(ticket.id)).toEqual([
        { tecnicoId: ANA, abierto: true, motivoFin: null, metaS: null, cumplido: null },
      ]);
    });

    it('si la transacción del alta se revierte, no queda ni el ticket ni el tramo', async () => {
      let ticketId = '';
      await expect(
        withTenant(() =>
          txRunner.run(async () => {
            ticketId = (await crear().execute(dto())).getValue().id;
            expect(await tramoRepo.listarPorTicket(ticketId)).toHaveLength(1);
            throw new RollbackIntencional('revertir el alta');
          }),
        ),
      ).rejects.toThrow('revertir el alta');

      expect(await client.ticket.count({ where: { id: ticketId } })).toBe(0);
      expect(await tramos(ticketId)).toEqual([]);
    });
  });

  describe('asignación manual (AsignarTicketUseCase)', () => {
    it('asignar abre el tramo; reasignar cierra el anterior como REASIGNADO y abre el del nuevo', async () => {
      const ticketId = await ticketPrevio('NUEVO');

      expect((await asignarA(ticketId, ANA)).isOk()).toBe(true);
      expect(await resumen(ticketId)).toEqual([
        { tecnicoId: ANA, abierto: true, motivoFin: null, metaS: null, cumplido: null },
      ]);

      expect((await asignarA(ticketId, BETO)).isOk()).toBe(true);
      expect(await resumen(ticketId)).toEqual([
        { tecnicoId: ANA, abierto: false, motivoFin: 'REASIGNADO', metaS: META_S, cumplido: null },
        { tecnicoId: BETO, abierto: true, motivoFin: null, metaS: null, cumplido: null },
      ]);
      const [deAna, deBeto] = await tramos(ticketId);
      expect(deAna.finAt).toEqual(deBeto.inicioAt);
    });

    it('reasignar al mismo responsable no cambia de tramo', async () => {
      const ticketId = await ticketPrevio('NUEVO');
      await asignarA(ticketId, ANA);
      const antes = await tramos(ticketId);

      expect((await asignarA(ticketId, ANA)).isOk()).toBe(true);

      expect(await tramos(ticketId)).toEqual(antes);
    });

    it('un ticket asignado antes del deploy abre tramo recién cuando cambia de manos', async () => {
      const ticketId = await ticketPrevio('EN_PROCESO', ANA);
      expect((await pasarA(ticketId, 'ESPERANDO_CLIENTE')).isOk()).toBe(true);
      expect(await tramos(ticketId)).toEqual([]);

      await asignarA(ticketId, BETO);

      expect(await resumen(ticketId)).toEqual([
        { tecnicoId: BETO, abierto: true, motivoFin: null, metaS: null, cumplido: null },
      ]);
    });

    it('si la transacción de la reasignación se revierte, los tramos quedan como estaban', async () => {
      const ticketId = await ticketPrevio('NUEVO');
      await asignarA(ticketId, ANA);
      const antes = await tramos(ticketId);

      await expect(
        withTenant(() =>
          txRunner.run(async () => {
            await asignar().execute({
              ticketId,
              asignadoId: BETO,
              clienteId: CLIENTE_ID,
              autorId: SOLICITANTE,
              actorId: SOLICITANTE,
              permisosPorTipo: null,
            });
            expect(await tramoRepo.listarPorTicket(ticketId)).toHaveLength(2);
            throw new RollbackIntencional('revertir la reasignación');
          }),
        ),
      ).rejects.toThrow('revertir la reasignación');

      expect(await tramos(ticketId)).toEqual(antes);
      expect((await client.ticket.findUniqueOrThrow({ where: { id: ticketId } })).asignadoId).toBe(
        ANA,
      );
    });
  });

  describe('asignar y poner en proceso (AsignarYPonerEnProcesoUseCase)', () => {
    it('abre el tramo del asignado y deja el ticket EN_PROCESO', async () => {
      const ticketId = await ticketPrevio('NUEVO');
      const useCase = new AsignarYPonerEnProcesoUseCase(
        ticketRepo,
        operacionRepo,
        estadoRepo,
        tipoTicketRepo,
        tipoOperacionRepo,
        checker,
        elegibilidad,
        new TicketStateMachineFactory(),
        txRunner,
        publisher,
      );

      const result = await withTenant(() =>
        useCase.execute({
          ticketId,
          asignadoId: ANA,
          autorId: SOLICITANTE,
          clienteId: CLIENTE_ID,
          actorId: SOLICITANTE,
          permisosPorTipo: null,
        }),
      );

      expect(result.isOk()).toBe(true);
      expect(await estadoDe(ticketId)).toBe('EN_PROCESO');
      expect(await resumen(ticketId)).toEqual([
        { tecnicoId: ANA, abierto: true, motivoFin: null, metaS: null, cumplido: null },
      ]);
    });
  });

  describe('transiciones (TransicionarEstadoUseCase)', () => {
    it('esperar al cliente no cierra; RESUELTO cierra con veredicto; reabrir abre un tramo nuevo', async () => {
      const ticketId = await ticketPrevio('NUEVO');
      await asignarA(ticketId, ANA);
      for (const estado of ['EN_PROCESO', 'ESPERANDO_CLIENTE', 'EN_PROCESO']) {
        expect((await pasarA(ticketId, estado)).isOk()).toBe(true);
      }
      expect(await resumen(ticketId)).toEqual([
        { tecnicoId: ANA, abierto: true, motivoFin: null, metaS: null, cumplido: null },
      ]);

      expect((await pasarA(ticketId, 'RESUELTO')).isOk()).toBe(true);
      expect(await resumen(ticketId)).toEqual([
        { tecnicoId: ANA, abierto: false, motivoFin: 'RESUELTO', metaS: META_S, cumplido: true },
      ]);
      expect((await tramos(ticketId))[0].habilS).toBeLessThan(60);

      expect((await pasarA(ticketId, 'EN_PROCESO', { corrector: true })).isOk()).toBe(true);
      expect(await resumen(ticketId)).toEqual([
        { tecnicoId: ANA, abierto: false, motivoFin: 'RESUELTO', metaS: META_S, cumplido: true },
        { tecnicoId: ANA, abierto: true, motivoFin: null, metaS: null, cumplido: null },
      ]);
    });

    it('RESUELTO → CERRADO no toca el tramo ya cerrado', async () => {
      const ticketId = await ticketPrevio('NUEVO');
      await asignarA(ticketId, ANA);
      await pasarA(ticketId, 'EN_PROCESO');
      await pasarA(ticketId, 'RESUELTO');
      const antes = await tramos(ticketId);

      expect((await pasarA(ticketId, 'CERRADO')).isOk()).toBe(true);

      expect(await tramos(ticketId)).toEqual(antes);
    });

    it('CANCELADO cierra el tramo sin veredicto', async () => {
      const ticketId = await ticketPrevio('NUEVO');
      await asignarA(ticketId, ANA);

      expect((await pasarA(ticketId, 'CANCELADO')).isOk()).toBe(true);

      expect(await resumen(ticketId)).toEqual([
        { tecnicoId: ANA, abierto: false, motivoFin: 'CANCELADO', metaS: META_S, cumplido: null },
      ]);
    });

    it('si la transición falla después de guardar el ticket, el tramo sigue abierto', async () => {
      const ticketId = await ticketPrevio('NUEVO');
      await asignarA(ticketId, ANA);
      await pasarA(ticketId, 'EN_PROCESO');
      const operacionesQueFallan: IOperacionTicketRepository = {
        save: async () => {
          throw new Error('fallo del historial');
        },
        findById: (id) => operacionRepo.findById(id),
        listByTicket: (id) => operacionRepo.listByTicket(id),
      };

      await expect(
        pasarA(ticketId, 'RESUELTO', { operaciones: operacionesQueFallan }),
      ).rejects.toThrow('fallo del historial');

      expect(await estadoDe(ticketId)).toBe('EN_PROCESO');
      expect(await resumen(ticketId)).toEqual([
        { tecnicoId: ANA, abierto: true, motivoFin: null, metaS: null, cumplido: null },
      ]);
    });
  });

  describe('avance por tareas (AvanzarEstadoPorTareasService)', () => {
    function avanzar(): AvanzarEstadoPorTareasService {
      return new AvanzarEstadoPorTareasService(
        ticketRepo,
        { listarPorTicket: async () => [] },
        operacionRepo,
        estadoRepo,
        tipoTicketRepo,
        tipoOperacionRepo,
        new TicketStateMachineFactory(),
        new PrismaRelojSlaMarcador(tenantContext),
        publisher,
        txRunner,
        elegibilidad,
      );
    }
    const completarUltima = (ticketId: string, autorId: string) =>
      withTenant(() =>
        txRunner.run(() => avanzar().aplicar('COMPLETAR', ticketId, autorId, CLIENTE_ID)),
      );

    it('completar la última tarea de un NUEVO sin responsable deja un tramo de 0 s que cumple', async () => {
      const ticketId = await ticketPrevio('NUEVO');

      await completarUltima(ticketId, BETO);

      expect(await estadoDe(ticketId)).toBe('RESUELTO');
      expect(await resumen(ticketId)).toEqual([
        { tecnicoId: BETO, abierto: false, motivoFin: 'RESUELTO', metaS: META_S, cumplido: true },
      ]);
      const [tramo] = await tramos(ticketId);
      expect(tramo).toMatchObject({ habilS: 0, finAt: tramo.inicioAt });
    });

    it('completar la última tarea de un ticket con tramo abierto lo cierra en RESUELTO', async () => {
      const ticketId = await ticketPrevio('NUEVO');
      await asignarA(ticketId, ANA);

      await completarUltima(ticketId, ANA);

      expect(await resumen(ticketId)).toEqual([
        { tecnicoId: ANA, abierto: false, motivoFin: 'RESUELTO', metaS: META_S, cumplido: true },
      ]);
    });

    it('si la transacción de la tarea se revierte, no queda tramo', async () => {
      const ticketId = await ticketPrevio('NUEVO');

      await expect(
        withTenant(() =>
          txRunner.run(async () => {
            await avanzar().aplicar('COMPLETAR', ticketId, BETO, CLIENTE_ID);
            throw new RollbackIntencional('revertir la tarea');
          }),
        ),
      ).rejects.toThrow('revertir la tarea');

      expect(await estadoDe(ticketId)).toBe('NUEVO');
      expect(await tramos(ticketId)).toEqual([]);
    });
  });

  it('un guardado fuera de toda transacción abre la suya: el tramo se escribe igual', async () => {
    const ticketId = await ticketPrevio('NUEVO');
    const ticket = await withTenant(() => ticketRepo.findById(ticketId));
    if (ticket === null) throw new Error('el ticket del test no existe');
    ticket.assignTo(ANA);

    await withTenant(() => ticketRepo.save(ticket));

    expect(await resumen(ticketId)).toEqual([
      { tecnicoId: ANA, abierto: true, motivoFin: null, metaS: null, cumplido: null },
    ]);
  });

  describe('medición en el horario del técnico, con la espera al cliente del historial (S2, S7)', () => {
    const META_LUNES_S = 2 * 3600;

    /**
     * Ticket que el técnico tiene de 9 a 14 del lunes, con meta de 2 h y espera al cliente de 10 a
     * 12 registrada como CAMBIO_ESTADO en `operaciones_ticket`. Devuelve el tramo cerrado en
     * RESUELTO.
     */
    async function tramoDeLunes(
      tecnicoId: string,
      escenario: {
        estadoInicial: string;
        cambios: ReadonlyArray<{ hora: string; estado: string; anterior?: string }>;
      } = {
        estadoInicial: 'EN_PROCESO',
        cambios: [
          { hora: '10:00', estado: 'ESPERANDO_CLIENTE' },
          { hora: '12:00', estado: 'EN_PROCESO' },
          { hora: '14:00', estado: 'RESUELTO' },
        ],
      },
    ): Promise<TramoTecnico> {
      const sincronizador = servicio(() => reloj);
      const ticketId = await ticketPrevio(escenario.estadoInicial, tecnicoId, META_LUNES_S);
      reloj = art('2026-10-26T09:00');
      await withTenant(() => txRunner.run(() => sincronizador.sincronizar(ticketId, null)));

      for (const { hora, estado, anterior } of escenario.cambios) {
        const instante = art(`2026-10-26T${hora}`);
        const operacion = OperacionTicketEntity.reconstitute(
          {
            ticketId,
            tipoOperacionId: ids.cambioEstado,
            descripcion: null,
            estadoAnteriorId: anterior === undefined ? null : ids.estados[anterior],
            estadoNuevoId: ids.estados[estado],
            autorId: tecnicoId,
            esInterno: false,
            metadata: null,
          },
          randomUUID(),
          instante,
          instante,
          null,
        );
        await withTenant(() => operacionRepo.save(operacion));
      }

      // El cambio de estado se escribe aparte y el servicio se invoca como lo hace el repositorio,
      // con la situación previa leída antes.
      reloj = art(`2026-10-26T${escenario.cambios[escenario.cambios.length - 1].hora}`);
      const previo = await withTenant(() => sincronizador.leerPrevio(ticketId));
      await client.ticket.update({
        where: { id: ticketId },
        data: { estadoId: ids.estados.RESUELTO },
      });
      await withTenant(() => txRunner.run(() => sincronizador.sincronizar(ticketId, previo)));
      const [tramo] = await tramos(ticketId);
      return tramo;
    }

    it('sin horario propio usa el del tenant (9 a 18), descuenta la espera y no cumple', async () => {
      expect(await tramoDeLunes(ANA)).toMatchObject({
        inicioAt: art('2026-10-26T09:00'),
        finAt: art('2026-10-26T14:00'),
        motivoFin: 'RESUELTO',
        habilS: 3 * 3600,
        metaS: META_LUNES_S,
        cumplido: false,
      });
    });

    it('un ticket sin historial que esperaba al cliente arranca pausado: lo dice el estado anterior del primer cambio (JD-A-002)', async () => {
      const tramo = await tramoDeLunes(ANA, {
        estadoInicial: 'ESPERANDO_CLIENTE',
        cambios: [
          { hora: '11:00', estado: 'EN_PROCESO', anterior: 'ESPERANDO_CLIENTE' },
          { hora: '12:00', estado: 'RESUELTO', anterior: 'EN_PROCESO' },
        ],
      });
      expect(tramo).toMatchObject({ habilS: 3600, metaS: META_LUNES_S, cumplido: true });
    });

    it('con horario propio (9 a 10) mide solo esa ventana y cumple', async () => {
      await client.horarioLaboralUsuarioDia.createMany({
        data: [0, 1, 2, 3, 4, 5, 6].map((diaSemana) => ({
          usuarioId: BETO,
          diaSemana,
          aperturaMinuto: diaSemana === 0 || diaSemana === 6 ? null : 540,
          cierreMinuto: diaSemana === 0 || diaSemana === 6 ? null : 600,
          updatedAt: new Date(),
        })),
      });

      expect(await tramoDeLunes(BETO)).toMatchObject({
        habilS: 3600,
        metaS: META_LUNES_S,
        cumplido: true,
      });
    });
  });
});
