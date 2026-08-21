/**
 * T7.2/T7.3/T7.4 [UNIT] — RED→GREEN: `TransicionarEstadoUseCase`.
 *
 * Todos los puertos mockeados (`vi.fn`) — sin DB. Cubre T12 (transición
 * válida, tx atómica, fecha_cierre en RESUELTO/CERRADO), T13 (evento
 * POST-COMMIT solo si notificable, publisher que lanza → swallow) y T9/T11
 * (transición inválida y rechazo de reapertura desde estado terminal, sin
 * mutar ni tocar la tx).
 *
 * Ref spec: sdd/tickets-core/spec T9, T11, T12, T13. Ref design: ADR-3,
 * ADR-6. Tarea: T7.2, T7.3, T7.4.
 */
import { TransicionarEstadoUseCase, TransicionarEstadoDto } from './transicionar-estado.use-case';
import { TicketEntity } from '../../domain/entities/ticket.entity';
import { EstadoEntity } from '../../domain/entities/estado.entity';
import { TipoTicketEntity } from '../../domain/entities/tipo-ticket.entity';
import { TicketEstadoCambiadoEvent } from '../../domain/events/ticket-estado-cambiado.event';
import {
  TicketNoEncontradoError,
  EstadoDestinoInvalidoError,
  TransicionInvalidaError,
} from '../../domain/errors/tickets.errors';
import { TicketStateMachineFactory } from '../../domain/state-machine/ticket-state-machine.factory';

const ESTADOS: Record<string, EstadoEntity> = {
  NUEVO: EstadoEntity.create(
    { codigo: 'NUEVO', nombre: 'Nuevo', color: null, orden: 1, activo: true },
    'estado-nuevo-uuid',
  ),
  ASIGNADO: EstadoEntity.create(
    { codigo: 'ASIGNADO', nombre: 'Asignado', color: null, orden: 2, activo: true },
    'estado-asignado-uuid',
  ),
  EN_PROCESO: EstadoEntity.create(
    { codigo: 'EN_PROCESO', nombre: 'En proceso', color: null, orden: 3, activo: true },
    'estado-en-proceso-uuid',
  ),
  RESUELTO: EstadoEntity.create(
    { codigo: 'RESUELTO', nombre: 'Resuelto', color: null, orden: 4, activo: true },
    'estado-resuelto-uuid',
  ),
  CERRADO: EstadoEntity.create(
    { codigo: 'CERRADO', nombre: 'Cerrado', color: null, orden: 5, activo: true },
    'estado-cerrado-uuid',
  ),
  CANCELADO: EstadoEntity.create(
    { codigo: 'CANCELADO', nombre: 'Cancelado', color: null, orden: 6, activo: true },
    'estado-cancelado-uuid',
  ),
};

function makeTicket(estadoCodigo: keyof typeof ESTADOS): TicketEntity {
  return TicketEntity.create(
    {
      numero: 'SOP-2026-00001',
      titulo: 'Ticket de prueba',
      descripcion: null,
      tipoId: 'tipo-soporte-uuid',
      estadoId: ESTADOS[estadoCodigo].id,
      prioridadId: 'prioridad-media-uuid',
      cicloId: 'ciclo-uuid',
      ticketReferenciaId: null,
      solicitanteId: 'solicitante-uuid',
    },
    'ticket-uuid',
  );
}

function baseDto(overrides: Partial<TransicionarEstadoDto> = {}): TransicionarEstadoDto {
  return {
    ticketId: 'ticket-uuid',
    nuevoEstadoCodigo: 'ASIGNADO',
    autorId: 'tecnico-uuid',
    actorEsCorrector: false,
    ...overrides,
  };
}

describe('TransicionarEstadoUseCase', () => {
  function makeCollaborators() {
    const ticketRepo = {
      findById: vi.fn(),
      save: vi.fn().mockResolvedValue(undefined),
    };
    const operacionRepo = { save: vi.fn().mockResolvedValue(undefined) };
    const estadoRepo = {
      findByCodigo: vi.fn((codigo: string) => Promise.resolve(ESTADOS[codigo] ?? null)),
      findById: vi.fn((id: string) =>
        Promise.resolve(Object.values(ESTADOS).find((e) => e.id === id) ?? null),
      ),
    };
    const tipoTicketRepo = {
      findById: vi
        .fn()
        .mockResolvedValue(
          TipoTicketEntity.create(
            { codigo: 'SOPORTE', nombre: 'Soporte', modulo: 'TICKETS', activo: true },
            'tipo-soporte-uuid',
          ),
        ),
    };
    const tipoOperacionRepo = {
      findIdByCodigo: vi.fn().mockResolvedValue('tipo-op-cambio-estado-uuid'),
    };
    const stateMachineFactory = new TicketStateMachineFactory();
    const eventPublisher = { publish: vi.fn() };
    // txRunner.run ejecuta el callback DIRECTAMENTE (sin Prisma real) — pero
    // preserva la semántica "corre dentro de la tx" para los tests.
    const txRunner = { run: vi.fn((fn: () => Promise<unknown>) => fn()) };

    const useCase = new TransicionarEstadoUseCase(
      ticketRepo as never,
      operacionRepo as never,
      estadoRepo as never,
      tipoTicketRepo as never,
      tipoOperacionRepo as never,
      stateMachineFactory,
      eventPublisher as never,
      txRunner as never,
    );

    return {
      useCase,
      ticketRepo,
      operacionRepo,
      estadoRepo,
      tipoTicketRepo,
      tipoOperacionRepo,
      eventPublisher,
      txRunner,
    };
  }

  it('T12: transición válida NUEVO→ASIGNADO — muta estado, registra operación CAMBIO_ESTADO en la misma tx, NO setea fecha_cierre', async () => {
    const c = makeCollaborators();
    c.ticketRepo.findById.mockResolvedValue(makeTicket('NUEVO'));

    const result = await c.useCase.execute(baseDto({ nuevoEstadoCodigo: 'ASIGNADO' }));

    expect(result.isOk()).toBe(true);
    const ticket = result.getValue();
    expect(ticket.estadoId).toBe('estado-asignado-uuid');
    expect(ticket.fechaCierre).toBeNull();

    expect(c.txRunner.run).toHaveBeenCalledTimes(1);
    expect(c.ticketRepo.save).toHaveBeenCalledWith(ticket);
    expect(c.operacionRepo.save).toHaveBeenCalledTimes(1);
    const operacionGuardada = c.operacionRepo.save.mock.calls[0][0];
    expect(operacionGuardada.estadoAnteriorId).toBe('estado-nuevo-uuid');
    expect(operacionGuardada.estadoNuevoId).toBe('estado-asignado-uuid');
    expect(operacionGuardada.autorId).toBe('tecnico-uuid');
  });

  it('T12: transición a RESUELTO setea fecha_cierre', async () => {
    const c = makeCollaborators();
    c.ticketRepo.findById.mockResolvedValue(makeTicket('ASIGNADO'));

    // ASIGNADO→RESUELTO no es un arco válido directo del grafo (ASIGNADO→EN_PROCESO/CANCELADO);
    // se usa un ticket EN_PROCESO real para validar el arco EN_PROCESO→RESUELTO.
    const ticketEnProceso = TicketEntity.create(
      {
        numero: 'SOP-2026-00002',
        titulo: 'Ticket en proceso',
        descripcion: null,
        tipoId: 'tipo-soporte-uuid',
        estadoId: 'estado-en-proceso-uuid',
        prioridadId: 'prioridad-media-uuid',
        cicloId: 'ciclo-uuid',
        ticketReferenciaId: null,
        solicitanteId: 'solicitante-uuid',
      },
      'ticket-uuid',
    );
    c.ticketRepo.findById.mockResolvedValue(ticketEnProceso);
    c.estadoRepo.findById.mockImplementation((id: string) => {
      if (id === 'estado-en-proceso-uuid') {
        return Promise.resolve(
          EstadoEntity.create(
            { codigo: 'EN_PROCESO', nombre: 'En proceso', color: null, orden: 3, activo: true },
            'estado-en-proceso-uuid',
          ),
        );
      }
      return Promise.resolve(Object.values(ESTADOS).find((e) => e.id === id) ?? null);
    });

    const result = await c.useCase.execute(baseDto({ nuevoEstadoCodigo: 'RESUELTO' }));

    expect(result.isOk()).toBe(true);
    const ticket = result.getValue();
    expect(ticket.estadoId).toBe('estado-resuelto-uuid');
    expect(ticket.fechaCierre).not.toBeNull();
  });

  it('regresión (sdd/corregir-fecha-cierre-tickets D1/D2): fecha_cierre persiste el INSTANTE exacto, no un día truncado', async () => {
    // `fecha_cierre` pasó de `@db.Date` a `@db.Timestamptz` — el defecto vivía
    // en el schema de la DB, no en este use case (`new Date()` ya escribía el
    // instante correcto). Esta cobertura protege ese hecho: si alguna vez se
    // reintrodujera un truncamiento acá (p.ej. `hoyArgentina()`), este test
    // debe fallar.
    vi.setSystemTime(new Date('2026-08-14T02:30:00.000Z')); // 23:30 ART del 13/08
    try {
      const c = makeCollaborators();
      const ticketEnProceso = TicketEntity.create(
        {
          numero: 'SOP-2026-00005',
          titulo: 'Ticket en proceso',
          descripcion: null,
          tipoId: 'tipo-soporte-uuid',
          estadoId: 'estado-en-proceso-uuid',
          prioridadId: 'prioridad-media-uuid',
          cicloId: 'ciclo-uuid',
          ticketReferenciaId: null,
          solicitanteId: 'solicitante-uuid',
        },
        'ticket-uuid',
      );
      c.ticketRepo.findById.mockResolvedValue(ticketEnProceso);
      c.estadoRepo.findById.mockImplementation((id: string) => {
        if (id === 'estado-en-proceso-uuid') {
          return Promise.resolve(
            EstadoEntity.create(
              { codigo: 'EN_PROCESO', nombre: 'En proceso', color: null, orden: 3, activo: true },
              'estado-en-proceso-uuid',
            ),
          );
        }
        return Promise.resolve(Object.values(ESTADOS).find((e) => e.id === id) ?? null);
      });

      const result = await c.useCase.execute(baseDto({ nuevoEstadoCodigo: 'RESUELTO' }));

      expect(result.isOk()).toBe(true);
      expect(result.getValue().fechaCierre?.toISOString()).toBe('2026-08-14T02:30:00.000Z');
    } finally {
      vi.useRealTimers();
    }
  });

  it('T13: transición a RESUELTO (notificable) emite TicketEstadoCambiadoEvent POST-COMMIT', async () => {
    const c = makeCollaborators();
    const ticketEnProceso = TicketEntity.create(
      {
        numero: 'SOP-2026-00003',
        titulo: 'Ticket en proceso',
        descripcion: null,
        tipoId: 'tipo-soporte-uuid',
        estadoId: 'estado-en-proceso-uuid',
        prioridadId: 'prioridad-media-uuid',
        cicloId: 'ciclo-uuid',
        ticketReferenciaId: null,
        solicitanteId: 'solicitante-uuid',
      },
      'ticket-uuid',
    );
    c.ticketRepo.findById.mockResolvedValue(ticketEnProceso);
    c.estadoRepo.findById.mockImplementation((id: string) => {
      if (id === 'estado-en-proceso-uuid') {
        return Promise.resolve(
          EstadoEntity.create(
            { codigo: 'EN_PROCESO', nombre: 'En proceso', color: null, orden: 3, activo: true },
            'estado-en-proceso-uuid',
          ),
        );
      }
      return Promise.resolve(Object.values(ESTADOS).find((e) => e.id === id) ?? null);
    });

    const result = await c.useCase.execute(baseDto({ nuevoEstadoCodigo: 'RESUELTO' }));

    expect(result.isOk()).toBe(true);
    expect(c.eventPublisher.publish).toHaveBeenCalledTimes(1);
    const evento = c.eventPublisher.publish.mock.calls[0][0] as TicketEstadoCambiadoEvent;
    expect(evento).toBeInstanceOf(TicketEstadoCambiadoEvent);
    expect(evento.name).toBe('ticket.estado_cambiado');
    expect(evento.ticketId).toBe('ticket-uuid');
    expect(evento.estadoAnteriorCodigo).toBe('EN_PROCESO');
    expect(evento.estadoNuevoCodigo).toBe('RESUELTO');
    expect(evento.autorId).toBe('tecnico-uuid');
  });

  it('T13: transición NO notificable (NUEVO→ASIGNADO) NO emite evento', async () => {
    const c = makeCollaborators();
    c.ticketRepo.findById.mockResolvedValue(makeTicket('NUEVO'));

    const result = await c.useCase.execute(baseDto({ nuevoEstadoCodigo: 'ASIGNADO' }));

    expect(result.isOk()).toBe(true);
    expect(c.eventPublisher.publish).not.toHaveBeenCalled();
  });

  it('T13: publisher que lanza → log-and-swallow, Result.ok igual (no revierte la transición ya committeada)', async () => {
    const c = makeCollaborators();
    const ticketEnProceso = TicketEntity.create(
      {
        numero: 'SOP-2026-00004',
        titulo: 'Ticket en proceso',
        descripcion: null,
        tipoId: 'tipo-soporte-uuid',
        estadoId: 'estado-en-proceso-uuid',
        prioridadId: 'prioridad-media-uuid',
        cicloId: 'ciclo-uuid',
        ticketReferenciaId: null,
        solicitanteId: 'solicitante-uuid',
      },
      'ticket-uuid',
    );
    c.ticketRepo.findById.mockResolvedValue(ticketEnProceso);
    c.estadoRepo.findById.mockImplementation((id: string) => {
      if (id === 'estado-en-proceso-uuid') {
        return Promise.resolve(
          EstadoEntity.create(
            { codigo: 'EN_PROCESO', nombre: 'En proceso', color: null, orden: 3, activo: true },
            'estado-en-proceso-uuid',
          ),
        );
      }
      return Promise.resolve(Object.values(ESTADOS).find((e) => e.id === id) ?? null);
    });
    c.eventPublisher.publish.mockImplementation(() => {
      throw new Error('boom: listener roto');
    });

    const result = await c.useCase.execute(baseDto({ nuevoEstadoCodigo: 'RESUELTO' }));

    expect(result.isOk()).toBe(true);
    expect(result.getValue().estadoId).toBe('estado-resuelto-uuid');
    expect(c.ticketRepo.save).toHaveBeenCalledTimes(1);
  });

  it('ticket inexistente → TicketNoEncontradoError (404), sin tocar la tx', async () => {
    const c = makeCollaborators();
    c.ticketRepo.findById.mockResolvedValue(null);

    const result = await c.useCase.execute(baseDto());

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
    expect(c.txRunner.run).not.toHaveBeenCalled();
  });

  it('ticket soft-deleted → TicketNoEncontradoError (404)', async () => {
    const c = makeCollaborators();
    const ticket = makeTicket('NUEVO');
    ticket.softDelete();
    c.ticketRepo.findById.mockResolvedValue(ticket);

    const result = await c.useCase.execute(baseDto());

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
  });

  it('nuevoEstadoCodigo inexistente en el catálogo → EstadoDestinoInvalidoError (422)', async () => {
    const c = makeCollaborators();
    c.ticketRepo.findById.mockResolvedValue(makeTicket('NUEVO'));

    const result = await c.useCase.execute(baseDto({ nuevoEstadoCodigo: 'NO_EXISTE' }));

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(EstadoDestinoInvalidoError);
    expect(c.txRunner.run).not.toHaveBeenCalled();
  });

  it('T9: arco inválido (NUEVO→CERRADO, no es un arco del grafo) → TransicionInvalidaError (422), sin mutar ni tocar la tx', async () => {
    const c = makeCollaborators();
    const ticket = makeTicket('NUEVO');
    c.ticketRepo.findById.mockResolvedValue(ticket);

    const result = await c.useCase.execute(baseDto({ nuevoEstadoCodigo: 'CERRADO' }));

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TransicionInvalidaError);
    expect(ticket.estadoId).toBe('estado-nuevo-uuid'); // sin mutar
    expect(c.txRunner.run).not.toHaveBeenCalled();
    expect(c.ticketRepo.save).not.toHaveBeenCalled();
    expect(c.operacionRepo.save).not.toHaveBeenCalled();
  });

  it('T7.4/T11: rechazo de reapertura — transición desde CERRADO → TransicionInvalidaError (422), sin mutar', async () => {
    const c = makeCollaborators();
    const ticket = makeTicket('CERRADO');
    c.ticketRepo.findById.mockResolvedValue(ticket);

    const result = await c.useCase.execute(baseDto({ nuevoEstadoCodigo: 'ASIGNADO' }));

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TransicionInvalidaError);
    expect(ticket.estadoId).toBe('estado-cerrado-uuid');
    expect(c.txRunner.run).not.toHaveBeenCalled();
  });

  it('T7.4/T11: rechazo de reapertura — transición desde CANCELADO → TransicionInvalidaError (422), sin mutar', async () => {
    const c = makeCollaborators();
    const ticket = makeTicket('CANCELADO');
    c.ticketRepo.findById.mockResolvedValue(ticket);

    const result = await c.useCase.execute(baseDto({ nuevoEstadoCodigo: 'ASIGNADO' }));

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TransicionInvalidaError);
    expect(ticket.estadoId).toBe('estado-cancelado-uuid');
    expect(c.txRunner.run).not.toHaveBeenCalled();
  });

  // ─── Salto correctivo (ROOT/ADMINISTRADOR) ───────────────────────────────
  describe('salto correctivo (actorEsCorrector)', () => {
    it('corrector: EN_PROCESO→ASIGNADO (volver atrás, NO es arco) → OK, muta y registra CAMBIO_ESTADO', async () => {
      const c = makeCollaborators();
      c.ticketRepo.findById.mockResolvedValue(makeTicket('EN_PROCESO'));

      const result = await c.useCase.execute(
        baseDto({ nuevoEstadoCodigo: 'ASIGNADO', actorEsCorrector: true }),
      );

      expect(result.isOk()).toBe(true);
      expect(result.getValue().estadoId).toBe('estado-asignado-uuid');
      expect(c.txRunner.run).toHaveBeenCalledTimes(1);
      expect(c.operacionRepo.save).toHaveBeenCalledTimes(1);
      const op = c.operacionRepo.save.mock.calls[0][0];
      expect(op.estadoAnteriorId).toBe('estado-en-proceso-uuid');
      expect(op.estadoNuevoId).toBe('estado-asignado-uuid');
    });

    it('corrector: reabrir desde terminal CERRADO→EN_PROCESO (no-terminal) → OK (bypassa canTransitionTo)', async () => {
      const c = makeCollaborators();
      c.ticketRepo.findById.mockResolvedValue(makeTicket('CERRADO'));

      const result = await c.useCase.execute(
        baseDto({ nuevoEstadoCodigo: 'EN_PROCESO', actorEsCorrector: true }),
      );

      expect(result.isOk()).toBe(true);
      expect(result.getValue().estadoId).toBe('estado-en-proceso-uuid');
      expect(c.txRunner.run).toHaveBeenCalledTimes(1);
    });

    it('regresión: reabrir CERRADO (con fecha_cierre)→EN_PROCESO LIMPIA fecha_cierre', async () => {
      const c = makeCollaborators();
      const ticket = makeTicket('CERRADO');
      ticket.setFechaCierre(new Date('2026-01-01T00:00:00Z'));
      c.ticketRepo.findById.mockResolvedValue(ticket);

      const result = await c.useCase.execute(
        baseDto({ nuevoEstadoCodigo: 'EN_PROCESO', actorEsCorrector: true }),
      );

      expect(result.isOk()).toBe(true);
      expect(result.getValue().estadoId).toBe('estado-en-proceso-uuid');
      // El ticket dejó de estar cerrado → su fecha_cierre debe quedar en null
      // (invariante: fecha_cierre no-nula ⟺ estado ∈ {RESUELTO, CERRADO}).
      expect(result.getValue().fechaCierre).toBeNull();
    });

    it('corrector: NO puede saltar a un estado terminal fuera de arco (NUEVO→CERRADO) → TransicionInvalidaError', async () => {
      const c = makeCollaborators();
      const ticket = makeTicket('NUEVO');
      c.ticketRepo.findById.mockResolvedValue(ticket);

      const result = await c.useCase.execute(
        baseDto({ nuevoEstadoCodigo: 'CERRADO', actorEsCorrector: true }),
      );

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(TransicionInvalidaError);
      expect(ticket.estadoId).toBe('estado-nuevo-uuid');
      expect(c.txRunner.run).not.toHaveBeenCalled();
    });

    it('corrector: un ticket soft-deleted sigue siendo inválido (404), el salto NO lo reabre', async () => {
      const c = makeCollaborators();
      const ticket = makeTicket('CERRADO');
      ticket.softDelete();
      c.ticketRepo.findById.mockResolvedValue(ticket);

      const result = await c.useCase.execute(
        baseDto({ nuevoEstadoCodigo: 'EN_PROCESO', actorEsCorrector: true }),
      );

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
      expect(c.txRunner.run).not.toHaveBeenCalled();
    });

    it('NO-corrector: intento del mismo salto (EN_PROCESO→ASIGNADO) → TransicionInvalidaError', async () => {
      const c = makeCollaborators();
      const ticket = makeTicket('EN_PROCESO');
      c.ticketRepo.findById.mockResolvedValue(ticket);

      const result = await c.useCase.execute(
        baseDto({ nuevoEstadoCodigo: 'ASIGNADO', actorEsCorrector: false }),
      );

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(TransicionInvalidaError);
      expect(ticket.estadoId).toBe('estado-en-proceso-uuid');
      expect(c.txRunner.run).not.toHaveBeenCalled();
    });
  });
});
