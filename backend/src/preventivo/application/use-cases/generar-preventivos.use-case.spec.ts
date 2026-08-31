/**
 * generar-preventivos.use-case.spec.ts — WU-5 (5.3/5.4/5.5) + WU-6 (6.1),
 * unit con dobles. `CalcularCicloService` y los repos se mockean: su
 * comportamiento REAL ya está probado en WU-3 (dominio puro) y en la
 * integración de WU-2/WU-4. Acá se prueba la ORQUESTACIÓN transaccional del
 * ciclo (ADR-PV2/PV3): el orden reservar → regla de pendiente →
 * CrearTicketUseCase → marcar → avance de puntero → publicación post-commit
 * de `preventivo.generado` vía `txRunner.alCommitear()` (WU-6, [R11]), y el
 * aislamiento por plan.
 *
 * Ref spec: sdd/preventivo/spec, Requirements "Idempotencia...",
 * "Recuperación de corrida perdida...", "No-solapamiento...", "Solicitante
 * del ticket generado...", "Aislamiento por tenant...", "Notificación solo al
 * generar". Ref design: ADR-PV2, ADR-PV3, ADR-PV4. Tarea: 5.3, 5.4, 5.5, 6.1.
 */
import { GenerarPreventivosUseCase } from './generar-preventivos.use-case';
import { PlanPreventivoEntity } from '../../domain/entities/plan-preventivo.entity';
import { Result } from '../../../shared/domain/result';
import { SolicitanteInvalidoError } from '../../../tickets/domain/errors/tickets.errors';
import type { TicketEntity } from '../../../tickets/domain/entities/ticket.entity';
import { EquipoInformaticoEntity } from '../../../equipos/domain/entities/equipo-informatico.entity';

/** Props mínimas de `EquipoInformaticoEntity`, comunes a los tres constructores de fixture. */
function propsEquipoMinimo(nombre: string) {
  return {
    nombre,
    numeroSerie: null,
    marca: null,
    modelo: null,
    fechaAdquisicion: null,
    ubicacion: null,
    importe: null,
    fechaValoracion: null,
    observaciones: null,
    valorResidual: null,
    fechaValorResidual: null,
  };
}

function makeEquipoVigente(id: string, nombre: string): EquipoInformaticoEntity {
  return EquipoInformaticoEntity.create(propsEquipoMinimo(nombre), id);
}

function makeEquipoDadoDeBaja(id: string, nombre: string): EquipoInformaticoEntity {
  const equipo = makeEquipoVigente(id, nombre);
  equipo.deactivate();
  return equipo;
}

function makeEquipoEliminado(id: string, nombre: string): EquipoInformaticoEntity {
  return EquipoInformaticoEntity.reconstitute(
    { ...propsEquipoMinimo(nombre), activo: true },
    id,
    new Date('2026-01-01'),
    new Date('2026-01-01'),
    new Date('2026-01-02'), // deletedAt no nulo → soft delete (ADR-1).
  );
}

/**
 * Doble mínimo del ticket creado. Se tipa como `Pick` y NO se castea a
 * `TicketEntity`: el use case solo lee `.id`, así que decir la verdad sobre lo
 * que este objeto es sale gratis, y un `as unknown as` acá taparía el día que
 * la orquestación empiece a leer otro campo.
 */
function fakeTicket(id: string): Pick<TicketEntity, 'id'> {
  return { id };
}

function makePlan(overrides: Partial<Parameters<typeof PlanPreventivoEntity.create>[0]> = {}) {
  return PlanPreventivoEntity.create(
    {
      titulo: 'Revisión de aire acondicionado',
      instrucciones: 'Limpiar filtros',
      equipoId: 'equipo-uuid',
      ubicacion: null,
      prioridadId: 'prioridad-uuid',
      responsableId: 'responsable-uuid',
      intervaloValor: 7,
      intervaloUnidad: 'DIAS',
      fechaInicio: new Date('2026-01-01'),
      proximaEjecucionEn: new Date('2026-01-08'),
      activo: true,
      ...overrides,
    },
    'plan-uuid',
  ).getValue();
}

/** `ResultadoCiclosPendientes` mínimo con un único candidato, sin salteados. */
function resultadoConCandidato(candidato: Date, proximaEjecucionEn: Date) {
  return { candidato, salteados: [], proximaEjecucionEn, reanclado: false };
}

describe('GenerarPreventivosUseCase (5.3/5.4/5.5)', () => {
  function buildUseCase(
    plan: PlanPreventivoEntity | null,
    equipoRepoOverride?: { findById: ReturnType<typeof vi.fn> },
  ) {
    const planRepo = {
      findVencibles: vi.fn().mockResolvedValue(plan ? [plan] : []),
      actualizarProximaEjecucion: vi.fn().mockResolvedValue(undefined),
    };
    const generacionRepo = {
      reservar: vi.fn().mockResolvedValue('generacion-uuid'),
      marcarGenerado: vi.fn().mockResolvedValue(undefined),
      marcarSalteadoPendiente: vi.fn().mockResolvedValue(undefined),
      registrarSalteadoAtraso: vi.fn().mockResolvedValue(undefined),
      existeTicketAbiertoDelPlan: vi.fn().mockResolvedValue(false),
    };
    const tipoTicketRepo = { findIdByCodigo: vi.fn().mockResolvedValue('tipo-mantenimiento-uuid') };
    const crearTicketUseCase = {
      execute: vi.fn().mockResolvedValue(Result.ok(fakeTicket('ticket-uuid'))),
    };
    // `alCommitear` del doble ejecuta la callback DE INMEDIATO (a diferencia
    // del runner real, que la encola hasta el commit) — acá no hay
    // transacción real que esperar, y lo que se prueba es SI la orquestación
    // la encola, no el timing del commit (ya cubierto en
    // tenant-transaction-runner.spec.ts).
    const txRunner = {
      run: vi.fn((fn: () => Promise<unknown>) => fn()),
      alCommitear: vi.fn((fn: () => void) => fn()),
    };
    const calcularCiclo = { ciclosPendientes: vi.fn() };
    const logger = { error: vi.fn() };
    const eventPublisher = { publish: vi.fn() };
    // Por defecto resuelve al equipo del plan como vigente (WU-2): las
    // pruebas de 5.x que no versan sobre el objetivo no necesitan mockear
    // esto a mano.
    const equipoRepo = equipoRepoOverride ?? {
      findById: vi
        .fn()
        .mockResolvedValue(
          plan?.equipoId ? makeEquipoVigente(plan.equipoId, 'Equipo Default') : null,
        ),
    };

    const useCase = new GenerarPreventivosUseCase(
      planRepo as never,
      generacionRepo as never,
      tipoTicketRepo as never,
      crearTicketUseCase as never,
      txRunner as never,
      calcularCiclo as never,
      logger as never,
      eventPublisher as never,
      equipoRepo as never,
    );

    return {
      useCase,
      planRepo,
      generacionRepo,
      tipoTicketRepo,
      crearTicketUseCase,
      txRunner,
      calcularCiclo,
      logger,
      eventPublisher,
      equipoRepo,
    };
  }

  it('sin planes vencibles → no consulta el catálogo ni abre transacciones', async () => {
    const { useCase, tipoTicketRepo, txRunner } = buildUseCase(null);

    await useCase.execute('cliente-uuid');

    expect(tipoTicketRepo.findIdByCodigo).not.toHaveBeenCalled();
    expect(txRunner.run).not.toHaveBeenCalled();
  });

  it('catálogo MANTENIMIENTO ausente → throw (bug de infraestructura, no error esperado)', async () => {
    const plan = makePlan();
    const { useCase, tipoTicketRepo } = buildUseCase(plan);
    tipoTicketRepo.findIdByCodigo.mockResolvedValue(null);

    await expect(useCase.execute('cliente-uuid')).rejects.toThrow(/MANTENIMIENTO/);
  });

  it('[R6/R9] ciclo sin pendiente ni error → reserva, crea ticket, marca GENERADO y avanza el puntero, EN ESE ORDEN', async () => {
    const plan = makePlan();
    const { useCase, generacionRepo, crearTicketUseCase, planRepo, calcularCiclo } =
      buildUseCase(plan);
    calcularCiclo.ciclosPendientes.mockReturnValue(
      resultadoConCandidato(new Date('2026-01-08'), new Date('2026-01-15')),
    );

    await useCase.execute('cliente-uuid');

    expect(generacionRepo.reservar).toHaveBeenCalledWith(plan.id, new Date('2026-01-08'));
    expect(crearTicketUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        solicitanteId: plan.responsableId,
        autorId: plan.responsableId,
        clienteId: 'cliente-uuid',
        prioridadId: plan.prioridadId,
        tipoId: 'tipo-mantenimiento-uuid',
      }),
    );
    expect(generacionRepo.marcarGenerado).toHaveBeenCalledWith('generacion-uuid', 'ticket-uuid');
    expect(planRepo.actualizarProximaEjecucion).toHaveBeenCalledWith(
      plan.id,
      new Date('2026-01-15'),
    );

    const ordenReserva = generacionRepo.reservar.mock.invocationCallOrder[0];
    const ordenCrear = crearTicketUseCase.execute.mock.invocationCallOrder[0];
    const ordenMarcar = generacionRepo.marcarGenerado.mock.invocationCallOrder[0];
    const ordenAvance = planRepo.actualizarProximaEjecucion.mock.invocationCallOrder[0];
    expect(ordenReserva).toBeLessThan(ordenCrear);
    expect(ordenCrear).toBeLessThan(ordenMarcar);
    expect(ordenMarcar).toBeLessThan(ordenAvance);
  });

  it('[R11] ciclo GENERADO → publica preventivo.generado vía txRunner.alCommitear(), DESPUÉS de marcar generado y avanzar el puntero', async () => {
    const plan = makePlan();
    const { useCase, generacionRepo, planRepo, calcularCiclo, txRunner, eventPublisher } =
      buildUseCase(plan);
    calcularCiclo.ciclosPendientes.mockReturnValue(
      resultadoConCandidato(new Date('2026-01-08'), new Date('2026-01-15')),
    );

    await useCase.execute('cliente-uuid');

    expect(txRunner.alCommitear).toHaveBeenCalledTimes(1);
    expect(eventPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'preventivo.generado',
        planId: plan.id,
        ticketId: 'ticket-uuid',
        responsableId: plan.responsableId,
      }),
    );

    const ordenMarcar = generacionRepo.marcarGenerado.mock.invocationCallOrder[0];
    const ordenAvance = planRepo.actualizarProximaEjecucion.mock.invocationCallOrder[0];
    const ordenAlCommitear = txRunner.alCommitear.mock.invocationCallOrder[0];
    expect(ordenMarcar).toBeLessThan(ordenAlCommitear);
    expect(ordenAvance).toBeLessThan(ordenAlCommitear);
  });

  it('[6.3] si el publisher/listener lanza al publicar preventivo.generado, el ciclo de generación NO aborta (el ticket y el puntero ya quedaron committeados)', async () => {
    const plan = makePlan();
    const { useCase, generacionRepo, planRepo, calcularCiclo, txRunner, eventPublisher } =
      buildUseCase(plan);
    calcularCiclo.ciclosPendientes.mockReturnValue(
      resultadoConCandidato(new Date('2026-01-08'), new Date('2026-01-15')),
    );
    eventPublisher.publish.mockImplementation(() => {
      throw new Error('listener boom');
    });
    // El runner real (`PrismaTenantTransactionRunner.ejecutarProtegida`)
    // envuelve cada callback de `alCommitear()` en su propio try/catch — acá
    // el doble reproduce esa misma red para probar que la orquestación NO
    // depende de un try/catch propio alrededor de la publicación.
    txRunner.alCommitear.mockImplementation((fn: () => void) => {
      try {
        fn();
      } catch {
        // log-and-swallow, igual que el runner real.
      }
    });

    await expect(useCase.execute('cliente-uuid')).resolves.toBeUndefined();

    expect(generacionRepo.marcarGenerado).toHaveBeenCalledWith('generacion-uuid', 'ticket-uuid');
    expect(planRepo.actualizarProximaEjecucion).toHaveBeenCalledWith(
      plan.id,
      new Date('2026-01-15'),
    );
  });

  it('[R8] preventivo abierto sin atender → SALTEADO_PENDIENTE, avanza el puntero, NO crea ticket, NO publica preventivo.generado', async () => {
    const plan = makePlan();
    const { useCase, generacionRepo, crearTicketUseCase, planRepo, calcularCiclo, eventPublisher } =
      buildUseCase(plan);
    calcularCiclo.ciclosPendientes.mockReturnValue(
      resultadoConCandidato(new Date('2026-01-08'), new Date('2026-01-15')),
    );
    generacionRepo.existeTicketAbiertoDelPlan.mockResolvedValue(true);

    await useCase.execute('cliente-uuid');

    expect(generacionRepo.marcarSalteadoPendiente).toHaveBeenCalledWith('generacion-uuid');
    expect(crearTicketUseCase.execute).not.toHaveBeenCalled();
    expect(planRepo.actualizarProximaEjecucion).toHaveBeenCalledWith(
      plan.id,
      new Date('2026-01-15'),
    );
    expect(eventPublisher.publish).not.toHaveBeenCalled();
  });

  it('[R6] reservar devuelve null (otra corrida ganó la carrera) → no hace NADA más, NO publica preventivo.generado', async () => {
    const plan = makePlan();
    const { useCase, generacionRepo, crearTicketUseCase, planRepo, calcularCiclo, eventPublisher } =
      buildUseCase(plan);
    calcularCiclo.ciclosPendientes.mockReturnValue(
      resultadoConCandidato(new Date('2026-01-08'), new Date('2026-01-15')),
    );
    generacionRepo.reservar.mockResolvedValue(null);

    await useCase.execute('cliente-uuid');

    expect(generacionRepo.existeTicketAbiertoDelPlan).not.toHaveBeenCalled();
    expect(crearTicketUseCase.execute).not.toHaveBeenCalled();
    expect(planRepo.actualizarProximaEjecucion).not.toHaveBeenCalled();
    expect(eventPublisher.publish).not.toHaveBeenCalled();
  });

  it('[R9] CrearTicketUseCase falla (responsable inválido) → throw dentro de la transacción, SIN marcar generado, SIN avanzar el puntero, SIN publicar preventivo.generado, y el fallo queda logueado', async () => {
    const plan = makePlan();
    const {
      useCase,
      generacionRepo,
      planRepo,
      crearTicketUseCase,
      calcularCiclo,
      logger,
      eventPublisher,
    } = buildUseCase(plan);
    calcularCiclo.ciclosPendientes.mockReturnValue(
      resultadoConCandidato(new Date('2026-01-08'), new Date('2026-01-15')),
    );
    crearTicketUseCase.execute.mockResolvedValue(
      Result.fail(new SolicitanteInvalidoError(plan.responsableId)),
    );

    await expect(useCase.execute('cliente-uuid')).resolves.toBeUndefined();

    expect(generacionRepo.marcarGenerado).not.toHaveBeenCalled();
    expect(planRepo.actualizarProximaEjecucion).not.toHaveBeenCalled();
    expect(eventPublisher.publish).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining(plan.id));
    // Ancla al mensaje del `throw` INTENCIONAL. Sin esto el test NO muerde:
    // sacando ese throw, el código sigue hasta `ticketResult.getValue()`, que
    // también revienta, y el try/catch por plan loguea igual con el planId —
    // los tres asserts de arriba se cumplen por los DOS caminos.
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('No se pudo generar el ticket del plan'),
    );
  });

  it('[R7] recuperación con ciclos atrasados → registra un SALTEADO_ATRASO por cada uno ANTES de reservar el candidato, y publica preventivo.generado UNA SOLA VEZ (por el candidato, no por cada salteado)', async () => {
    const plan = makePlan();
    const { useCase, generacionRepo, calcularCiclo, eventPublisher } = buildUseCase(plan);
    calcularCiclo.ciclosPendientes.mockReturnValue({
      candidato: new Date('2026-01-29'),
      salteados: [new Date('2026-01-08'), new Date('2026-01-15'), new Date('2026-01-22')],
      proximaEjecucionEn: new Date('2026-02-05'),
      reanclado: false,
    });

    await useCase.execute('cliente-uuid');

    expect(generacionRepo.registrarSalteadoAtraso).toHaveBeenCalledTimes(3);
    expect(generacionRepo.registrarSalteadoAtraso).toHaveBeenNthCalledWith(
      1,
      plan.id,
      new Date('2026-01-08'),
    );
    const ordenUltimoSalteo = generacionRepo.registrarSalteadoAtraso.mock.invocationCallOrder[2];
    const ordenReserva = generacionRepo.reservar.mock.invocationCallOrder[0];
    expect(ordenUltimoSalteo).toBeLessThan(ordenReserva);
    expect(eventPublisher.publish).toHaveBeenCalledTimes(1);
  });

  it('[R7] TOPE agotado (caso patológico) → una única fila de salteo, re-ancla el puntero, NO reserva ni crea ticket, NO publica preventivo.generado', async () => {
    const plan = makePlan();
    const { useCase, generacionRepo, crearTicketUseCase, planRepo, calcularCiclo, eventPublisher } =
      buildUseCase(plan);
    calcularCiclo.ciclosPendientes.mockReturnValue({
      candidato: null,
      salteados: [new Date('2026-01-08')],
      proximaEjecucionEn: new Date('2027-01-01'),
      reanclado: true,
    });

    await useCase.execute('cliente-uuid');

    expect(generacionRepo.registrarSalteadoAtraso).toHaveBeenCalledTimes(1);
    expect(generacionRepo.reservar).not.toHaveBeenCalled();
    expect(crearTicketUseCase.execute).not.toHaveBeenCalled();
    expect(planRepo.actualizarProximaEjecucion).toHaveBeenCalledWith(
      plan.id,
      new Date('2027-01-01'),
    );
    expect(eventPublisher.publish).not.toHaveBeenCalled();
  });

  it('un plan roto no aborta el resto del barrido (aislamiento por plan)', async () => {
    const planRoto = makePlan({ titulo: 'Plan roto' });
    const planOk = PlanPreventivoEntity.create(
      {
        titulo: 'Plan sano',
        instrucciones: null,
        equipoId: 'equipo-2-uuid',
        ubicacion: null,
        prioridadId: 'prioridad-uuid',
        responsableId: 'responsable-uuid',
        intervaloValor: 7,
        intervaloUnidad: 'DIAS',
        fechaInicio: new Date('2026-01-01'),
        proximaEjecucionEn: new Date('2026-01-08'),
        activo: true,
      },
      'plan-2-uuid',
    ).getValue();

    const planRepo = {
      findVencibles: vi.fn().mockResolvedValue([planRoto, planOk]),
      actualizarProximaEjecucion: vi.fn().mockResolvedValue(undefined),
    };
    const generacionRepo = {
      reservar: vi
        .fn()
        .mockRejectedValueOnce(new Error('DB caída'))
        .mockResolvedValueOnce('generacion-2-uuid'),
      marcarGenerado: vi.fn().mockResolvedValue(undefined),
      marcarSalteadoPendiente: vi.fn().mockResolvedValue(undefined),
      registrarSalteadoAtraso: vi.fn().mockResolvedValue(undefined),
      existeTicketAbiertoDelPlan: vi.fn().mockResolvedValue(false),
    };
    const tipoTicketRepo = { findIdByCodigo: vi.fn().mockResolvedValue('tipo-mantenimiento-uuid') };
    const crearTicketUseCase = {
      execute: vi.fn().mockResolvedValue(Result.ok(fakeTicket('ticket-2-uuid'))),
    };
    const txRunner = {
      run: vi.fn((fn: () => Promise<unknown>) => fn()),
      alCommitear: vi.fn((fn: () => void) => fn()),
    };
    const calcularCiclo = {
      ciclosPendientes: vi
        .fn()
        .mockReturnValue(resultadoConCandidato(new Date('2026-01-08'), new Date('2026-01-15'))),
    };
    const logger = { error: vi.fn() };
    const eventPublisher = { publish: vi.fn() };
    const equipoRepo = {
      findById: vi.fn().mockResolvedValue(makeEquipoVigente('equipo-2-uuid', 'Equipo Sano')),
    };

    const useCase = new GenerarPreventivosUseCase(
      planRepo as never,
      generacionRepo as never,
      tipoTicketRepo as never,
      crearTicketUseCase as never,
      txRunner as never,
      calcularCiclo as never,
      logger as never,
      eventPublisher as never,
      equipoRepo as never,
    );

    await expect(useCase.execute('cliente-uuid')).resolves.toBeUndefined();

    expect(generacionRepo.reservar).toHaveBeenCalledTimes(2);
    expect(generacionRepo.marcarGenerado).toHaveBeenCalledTimes(1);
    expect(generacionRepo.marcarGenerado).toHaveBeenCalledWith(
      'generacion-2-uuid',
      'ticket-2-uuid',
    );
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining(planRoto.id));
    // Solo el plan sano publica: el roto revienta ANTES de llegar a reservar.
    expect(eventPublisher.publish).toHaveBeenCalledTimes(1);
    expect(eventPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({ planId: planOk.id, ticketId: 'ticket-2-uuid' }),
    );
  });

  describe('WU-2 — objetivo del plan en la descripción del ticket (2.3/2.4)', () => {
    it('[OT-R1] equipo vigente → descripción antepone "Equipo: <nombre>"', async () => {
      const plan = makePlan({ equipoId: 'equipo-uuid', instrucciones: 'Limpiar ventiladores' });
      const equipoRepo = {
        findById: vi.fn().mockResolvedValue(makeEquipoVigente('equipo-uuid', 'Notebook Dell 5420')),
      };
      const { useCase, crearTicketUseCase, calcularCiclo } = buildUseCase(plan, equipoRepo);
      calcularCiclo.ciclosPendientes.mockReturnValue(
        resultadoConCandidato(new Date('2026-01-08'), new Date('2026-01-15')),
      );

      await useCase.execute('cliente-uuid');

      expect(equipoRepo.findById).toHaveBeenCalledWith('equipo-uuid');
      expect(crearTicketUseCase.execute).toHaveBeenCalledTimes(1);
      expect(crearTicketUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          descripcion: 'Equipo: Notebook Dell 5420\n\nLimpiar ventiladores',
          titulo: plan.titulo,
          tipoId: 'tipo-mantenimiento-uuid',
          prioridadId: plan.prioridadId,
          solicitanteId: plan.responsableId,
          clienteId: 'cliente-uuid',
          autorId: plan.responsableId,
        }),
      );
    });

    it('[OT-R2] equipo con activo=false (dado de baja) → descripción lo identifica como dado de baja y genera igual', async () => {
      const plan = makePlan({ equipoId: 'equipo-uuid', instrucciones: 'Limpiar ventiladores' });
      const equipoRepo = {
        findById: vi
          .fn()
          .mockResolvedValue(makeEquipoDadoDeBaja('equipo-uuid', 'Notebook Dell 5420')),
      };
      const { useCase, crearTicketUseCase, calcularCiclo } = buildUseCase(plan, equipoRepo);
      calcularCiclo.ciclosPendientes.mockReturnValue(
        resultadoConCandidato(new Date('2026-01-08'), new Date('2026-01-15')),
      );

      await useCase.execute('cliente-uuid');

      expect(crearTicketUseCase.execute).toHaveBeenCalledTimes(1);
      expect(crearTicketUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          descripcion: 'Equipo: Notebook Dell 5420 (dado de baja)\n\nLimpiar ventiladores',
        }),
      );
    });

    it('[OT-R2] equipo eliminado (isDeleted) → descripción lo identifica como eliminado del inventario y genera igual', async () => {
      const plan = makePlan({ equipoId: 'equipo-uuid', instrucciones: 'Limpiar ventiladores' });
      const equipoRepo = {
        findById: vi
          .fn()
          .mockResolvedValue(makeEquipoEliminado('equipo-uuid', 'Notebook Dell 5420')),
      };
      const { useCase, crearTicketUseCase, calcularCiclo } = buildUseCase(plan, equipoRepo);
      calcularCiclo.ciclosPendientes.mockReturnValue(
        resultadoConCandidato(new Date('2026-01-08'), new Date('2026-01-15')),
      );

      await useCase.execute('cliente-uuid');

      expect(crearTicketUseCase.execute).toHaveBeenCalledTimes(1);
      expect(crearTicketUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          descripcion:
            'Equipo: Notebook Dell 5420 (eliminado del inventario)\n\nLimpiar ventiladores',
        }),
      );
    });

    it('[OT-R2] findById devuelve null (equipo inexistente) → descripción degrada distinto del caso "dado de baja" y genera igual', async () => {
      const plan = makePlan({ equipoId: 'equipo-uuid', instrucciones: 'Limpiar ventiladores' });
      const equipoRepo = { findById: vi.fn().mockResolvedValue(null) };
      const { useCase, crearTicketUseCase, calcularCiclo } = buildUseCase(plan, equipoRepo);
      calcularCiclo.ciclosPendientes.mockReturnValue(
        resultadoConCandidato(new Date('2026-01-08'), new Date('2026-01-15')),
      );

      await useCase.execute('cliente-uuid');

      expect(crearTicketUseCase.execute).toHaveBeenCalledTimes(1);
      expect(crearTicketUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          descripcion: 'Equipo: no encontrado (id equipo-uuid)\n\nLimpiar ventiladores',
        }),
      );
    });

    it('[OT-R2] findById lanza (equipo no consultable) → descripción degrada, loguea EQUIPO_NO_CONSULTABLE y NO aborta la generación', async () => {
      const plan = makePlan({ equipoId: 'equipo-uuid', instrucciones: 'Limpiar ventiladores' });
      const equipoRepo = {
        findById: vi.fn().mockRejectedValue(new Error('timeout de conexión')),
      };
      const { useCase, crearTicketUseCase, calcularCiclo, logger, generacionRepo } = buildUseCase(
        plan,
        equipoRepo,
      );
      calcularCiclo.ciclosPendientes.mockReturnValue(
        resultadoConCandidato(new Date('2026-01-08'), new Date('2026-01-15')),
      );

      await useCase.execute('cliente-uuid');

      expect(crearTicketUseCase.execute).toHaveBeenCalledTimes(1);
      expect(crearTicketUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          descripcion: 'Equipo: no se pudo consultar (id equipo-uuid)\n\nLimpiar ventiladores',
        }),
      );
      expect(generacionRepo.marcarGenerado).toHaveBeenCalledTimes(1);
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('EQUIPO_NO_CONSULTABLE'));
    });

    it('[OT-R2] dos planes vencidos, uno con equipo irresoluble y otro con objetivo válido → los dos generan su ticket, ninguno bloquea al otro', async () => {
      const planIrresoluble = PlanPreventivoEntity.create(
        {
          titulo: 'Plan con equipo irresoluble',
          instrucciones: 'Revisar cableado',
          equipoId: 'equipo-irresoluble-uuid',
          ubicacion: null,
          prioridadId: 'prioridad-uuid',
          responsableId: 'responsable-uuid',
          intervaloValor: 7,
          intervaloUnidad: 'DIAS',
          fechaInicio: new Date('2026-01-01'),
          proximaEjecucionEn: new Date('2026-01-08'),
          activo: true,
        },
        'plan-irresoluble-uuid',
      ).getValue();
      const planValido = PlanPreventivoEntity.create(
        {
          titulo: 'Plan con objetivo válido',
          instrucciones: 'Revisar UPS',
          equipoId: null,
          ubicacion: 'SALA DE SERVIDORES',
          prioridadId: 'prioridad-uuid',
          responsableId: 'responsable-uuid',
          intervaloValor: 7,
          intervaloUnidad: 'DIAS',
          fechaInicio: new Date('2026-01-01'),
          proximaEjecucionEn: new Date('2026-01-08'),
          activo: true,
        },
        'plan-valido-uuid',
      ).getValue();

      const planRepo = {
        findVencibles: vi.fn().mockResolvedValue([planIrresoluble, planValido]),
        actualizarProximaEjecucion: vi.fn().mockResolvedValue(undefined),
      };
      const generacionRepo = {
        reservar: vi
          .fn()
          .mockResolvedValueOnce('generacion-irresoluble-uuid')
          .mockResolvedValueOnce('generacion-valida-uuid'),
        marcarGenerado: vi.fn().mockResolvedValue(undefined),
        marcarSalteadoPendiente: vi.fn().mockResolvedValue(undefined),
        registrarSalteadoAtraso: vi.fn().mockResolvedValue(undefined),
        existeTicketAbiertoDelPlan: vi.fn().mockResolvedValue(false),
      };
      const tipoTicketRepo = {
        findIdByCodigo: vi.fn().mockResolvedValue('tipo-mantenimiento-uuid'),
      };
      const crearTicketUseCase = {
        execute: vi
          .fn()
          .mockResolvedValueOnce(Result.ok(fakeTicket('ticket-irresoluble-uuid')))
          .mockResolvedValueOnce(Result.ok(fakeTicket('ticket-valido-uuid'))),
      };
      const txRunner = {
        run: vi.fn((fn: () => Promise<unknown>) => fn()),
        alCommitear: vi.fn((fn: () => void) => fn()),
      };
      const calcularCiclo = {
        ciclosPendientes: vi
          .fn()
          .mockReturnValue(resultadoConCandidato(new Date('2026-01-08'), new Date('2026-01-15'))),
      };
      const logger = { error: vi.fn() };
      const eventPublisher = { publish: vi.fn() };
      const equipoRepo = { findById: vi.fn().mockResolvedValue(null) };

      const useCase = new GenerarPreventivosUseCase(
        planRepo as never,
        generacionRepo as never,
        tipoTicketRepo as never,
        crearTicketUseCase as never,
        txRunner as never,
        calcularCiclo as never,
        logger as never,
        eventPublisher as never,
        equipoRepo as never,
      );

      await expect(useCase.execute('cliente-uuid')).resolves.toBeUndefined();

      expect(generacionRepo.marcarGenerado).toHaveBeenCalledTimes(2);
      expect(crearTicketUseCase.execute).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          descripcion: 'Equipo: no encontrado (id equipo-irresoluble-uuid)\n\nRevisar cableado',
        }),
      );
      expect(crearTicketUseCase.execute).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          descripcion: 'Ubicación: SALA DE SERVIDORES\n\nRevisar UPS',
        }),
      );
    });
  });
});
