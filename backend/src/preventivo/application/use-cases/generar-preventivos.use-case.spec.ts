/**
 * generar-preventivos.use-case.spec.ts — WU-5 (5.3/5.4/5.5), unit con
 * dobles. `CalcularCicloService` y los repos se mockean: su comportamiento
 * REAL ya está probado en WU-3 (dominio puro) y en la integración de WU-2/
 * WU-4. Acá se prueba la ORQUESTACIÓN transaccional del ciclo (ADR-PV2/PV3):
 * el orden reservar → regla de pendiente → CrearTicketUseCase → marcar →
 * avance de puntero, y el aislamiento por plan.
 *
 * Ref spec: sdd/preventivo/spec, Requirements "Idempotencia...",
 * "Recuperación de corrida perdida...", "No-solapamiento...", "Solicitante
 * del ticket generado...", "Aislamiento por tenant...". Ref design: ADR-PV2,
 * ADR-PV3, ADR-PV4. Tarea: 5.3, 5.4, 5.5.
 */
import { GenerarPreventivosUseCase } from './generar-preventivos.use-case';
import { PlanPreventivoEntity } from '../../domain/entities/plan-preventivo.entity';
import { Result } from '../../../shared/domain/result';
import { SolicitanteInvalidoError } from '../../../tickets/domain/errors/tickets.errors';
import type { TicketEntity } from '../../../tickets/domain/entities/ticket.entity';

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
  function buildUseCase(plan: PlanPreventivoEntity | null) {
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
    const txRunner = { run: vi.fn((fn: () => Promise<unknown>) => fn()) };
    const calcularCiclo = { ciclosPendientes: vi.fn() };
    const logger = { error: vi.fn() };

    const useCase = new GenerarPreventivosUseCase(
      planRepo as never,
      generacionRepo as never,
      tipoTicketRepo as never,
      crearTicketUseCase as never,
      txRunner as never,
      calcularCiclo as never,
      logger as never,
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

  it('[R8] preventivo abierto sin atender → SALTEADO_PENDIENTE, avanza el puntero, NO crea ticket', async () => {
    const plan = makePlan();
    const { useCase, generacionRepo, crearTicketUseCase, planRepo, calcularCiclo } =
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
  });

  it('[R6] reservar devuelve null (otra corrida ganó la carrera) → no hace NADA más', async () => {
    const plan = makePlan();
    const { useCase, generacionRepo, crearTicketUseCase, planRepo, calcularCiclo } =
      buildUseCase(plan);
    calcularCiclo.ciclosPendientes.mockReturnValue(
      resultadoConCandidato(new Date('2026-01-08'), new Date('2026-01-15')),
    );
    generacionRepo.reservar.mockResolvedValue(null);

    await useCase.execute('cliente-uuid');

    expect(generacionRepo.existeTicketAbiertoDelPlan).not.toHaveBeenCalled();
    expect(crearTicketUseCase.execute).not.toHaveBeenCalled();
    expect(planRepo.actualizarProximaEjecucion).not.toHaveBeenCalled();
  });

  it('[R9] CrearTicketUseCase falla (responsable inválido) → throw dentro de la transacción, SIN marcar generado, SIN avanzar el puntero, y el fallo queda logueado', async () => {
    const plan = makePlan();
    const { useCase, generacionRepo, planRepo, crearTicketUseCase, calcularCiclo, logger } =
      buildUseCase(plan);
    calcularCiclo.ciclosPendientes.mockReturnValue(
      resultadoConCandidato(new Date('2026-01-08'), new Date('2026-01-15')),
    );
    crearTicketUseCase.execute.mockResolvedValue(
      Result.fail(new SolicitanteInvalidoError(plan.responsableId)),
    );

    await expect(useCase.execute('cliente-uuid')).resolves.toBeUndefined();

    expect(generacionRepo.marcarGenerado).not.toHaveBeenCalled();
    expect(planRepo.actualizarProximaEjecucion).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining(plan.id));
    // Ancla al mensaje del `throw` INTENCIONAL. Sin esto el test NO muerde:
    // sacando ese throw, el código sigue hasta `ticketResult.getValue()`, que
    // también revienta, y el try/catch por plan loguea igual con el planId —
    // los tres asserts de arriba se cumplen por los DOS caminos.
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('No se pudo generar el ticket del plan'),
    );
  });

  it('[R7] recuperación con ciclos atrasados → registra un SALTEADO_ATRASO por cada uno ANTES de reservar el candidato', async () => {
    const plan = makePlan();
    const { useCase, generacionRepo, calcularCiclo } = buildUseCase(plan);
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
  });

  it('[R7] TOPE agotado (caso patológico) → una única fila de salteo, re-ancla el puntero, NO reserva ni crea ticket', async () => {
    const plan = makePlan();
    const { useCase, generacionRepo, crearTicketUseCase, planRepo, calcularCiclo } =
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
    const txRunner = { run: vi.fn((fn: () => Promise<unknown>) => fn()) };
    const calcularCiclo = {
      ciclosPendientes: vi
        .fn()
        .mockReturnValue(resultadoConCandidato(new Date('2026-01-08'), new Date('2026-01-15'))),
    };
    const logger = { error: vi.fn() };

    const useCase = new GenerarPreventivosUseCase(
      planRepo as never,
      generacionRepo as never,
      tipoTicketRepo as never,
      crearTicketUseCase as never,
      txRunner as never,
      calcularCiclo as never,
      logger as never,
    );

    await expect(useCase.execute('cliente-uuid')).resolves.toBeUndefined();

    expect(generacionRepo.reservar).toHaveBeenCalledTimes(2);
    expect(generacionRepo.marcarGenerado).toHaveBeenCalledTimes(1);
    expect(generacionRepo.marcarGenerado).toHaveBeenCalledWith(
      'generacion-2-uuid',
      'ticket-2-uuid',
    );
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining(planRoto.id));
  });
});
