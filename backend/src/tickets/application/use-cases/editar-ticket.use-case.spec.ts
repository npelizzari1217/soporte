/**
 * T6.5 [UNIT] — RED→GREEN: `EditarTicketUseCase` (T8 — titulo/descripcion/
 * prioridad, NUNCA estado).
 *
 * Ref spec: sdd/tickets-core/spec T8. Tarea: T6.5.
 */
import { EditarTicketUseCase } from './editar-ticket.use-case';
import { TicketEntity } from '../../domain/entities/ticket.entity';
import { PrioridadEntity } from '../../domain/entities/prioridad.entity';
import { EstadoEntity } from '../../domain/entities/estado.entity';
import { TicketReprioritizadoEvent } from '../../domain/events/ticket-reprioritizado.event';
import {
  TicketNoEncontradoError,
  PrioridadNoEncontradaError,
  TicketBloqueadoParaEdicionError,
} from '../../domain/errors/tickets.errors';

/**
 * Estados de catálogo indexados por id — `estadoRepo.findById(ticket.estadoId)`
 * resuelve el código semántico para la regla de bloqueo por estado.
 */
const ESTADOS: Record<string, EstadoEntity> = {
  'estado-nuevo-uuid': EstadoEntity.create(
    { codigo: 'NUEVO', nombre: 'Nuevo', color: null, orden: 1, activo: true },
    'estado-nuevo-uuid',
  ),
  'estado-asignado-uuid': EstadoEntity.create(
    { codigo: 'ASIGNADO', nombre: 'Asignado', color: null, orden: 2, activo: true },
    'estado-asignado-uuid',
  ),
  'estado-en-proceso-uuid': EstadoEntity.create(
    { codigo: 'EN_PROCESO', nombre: 'En proceso', color: null, orden: 3, activo: true },
    'estado-en-proceso-uuid',
  ),
};

function makeTicket(estadoId = 'estado-nuevo-uuid'): TicketEntity {
  return TicketEntity.create(
    {
      numero: 'SOP-2026-00001',
      titulo: 'Titulo original',
      descripcion: 'Descripcion original',
      tipoId: 'tipo-uuid',
      estadoId,
      prioridadId: 'prioridad-media-uuid',
      cicloId: null,
      ticketReferenciaId: null,
      solicitanteId: 'solicitante-uuid',
    },
    'ticket-uuid',
  );
}

describe('EditarTicketUseCase', () => {
  function makeCollaborators(ticket: TicketEntity | null) {
    const ticketRepo = {
      findById: vi.fn().mockResolvedValue(ticket),
      save: vi.fn().mockResolvedValue(undefined),
    };
    const prioridadRepo = {
      findById: vi
        .fn()
        .mockResolvedValue(
          PrioridadEntity.create(
            { codigo: 'ALTA', nombre: 'Alta', color: null, orden: 3, activo: true },
            'prioridad-alta-uuid',
          ),
        ),
    };
    const estadoRepo = {
      findById: vi.fn((id: string) => Promise.resolve(ESTADOS[id] ?? null)),
    };
    const eventPublisher = { publish: vi.fn() };
    const useCase = new EditarTicketUseCase(
      ticketRepo as never,
      prioridadRepo as never,
      estadoRepo as never,
      eventPublisher as never,
    );
    return { useCase, ticketRepo, prioridadRepo, estadoRepo, eventPublisher };
  }

  it('actualiza titulo/descripcion/prioridadId y persiste', async () => {
    const c = makeCollaborators(makeTicket());

    const result = await c.useCase.execute({
      ticketId: 'ticket-uuid',
      titulo: 'Nuevo titulo',
      descripcion: 'Nueva descripcion',
      prioridadId: 'prioridad-alta-uuid',
      actorEsRoot: false,
    });

    expect(result.isOk()).toBe(true);
    const ticket = result.getValue();
    expect(ticket.titulo).toBe('Nuevo titulo');
    expect(ticket.descripcion).toBe('Nueva descripcion');
    expect(ticket.prioridadId).toBe('prioridad-alta-uuid');
    expect(c.ticketRepo.save).toHaveBeenCalledWith(ticket);
  });

  it('NUNCA muta el estado, incluso si el DTO no lo permite en el tipo (invariante de dominio)', async () => {
    const c = makeCollaborators(makeTicket());

    const result = await c.useCase.execute({
      ticketId: 'ticket-uuid',
      titulo: 'X',
      actorEsRoot: false,
    });

    expect(result.getValue().estadoId).toBe('estado-nuevo-uuid');
  });

  it('campos omitidos no se tocan (PATCH parcial)', async () => {
    const c = makeCollaborators(makeTicket());

    const result = await c.useCase.execute({
      ticketId: 'ticket-uuid',
      titulo: 'Solo titulo',
      actorEsRoot: false,
    });

    expect(result.getValue().descripcion).toBe('Descripcion original');
    expect(result.getValue().prioridadId).toBe('prioridad-media-uuid');
  });

  it('ticket inexistente → TicketNoEncontradoError (404)', async () => {
    const c = makeCollaborators(null);

    const result = await c.useCase.execute({
      ticketId: 'no-existe',
      titulo: 'X',
      actorEsRoot: false,
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
  });

  it('ticket soft-deleted se trata como inexistente → TicketNoEncontradoError (404)', async () => {
    const ticket = makeTicket();
    ticket.softDelete();
    const c = makeCollaborators(ticket);

    const result = await c.useCase.execute({
      ticketId: 'ticket-uuid',
      titulo: 'X',
      actorEsRoot: false,
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
  });

  it('prioridadId inexistente en el catálogo del tenant → PrioridadNoEncontradaError (422), sin persistir', async () => {
    const c = makeCollaborators(makeTicket());
    c.prioridadRepo.findById.mockResolvedValue(null);

    const result = await c.useCase.execute({
      ticketId: 'ticket-uuid',
      prioridadId: 'no-existe',
      actorEsRoot: false,
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(PrioridadNoEncontradaError);
    expect(c.ticketRepo.save).not.toHaveBeenCalled();
  });

  it('SA10 (Fase 4, aditivo, GATE G3): publica TicketReprioritizadoEvent SOLO si prioridadId cambia', async () => {
    const c = makeCollaborators(makeTicket());

    await c.useCase.execute({
      ticketId: 'ticket-uuid',
      prioridadId: 'prioridad-alta-uuid',
      actorEsRoot: false,
    });

    expect(c.eventPublisher.publish).toHaveBeenCalledTimes(1);
    const evento = c.eventPublisher.publish.mock.calls[0][0];
    expect(evento).toBeInstanceOf(TicketReprioritizadoEvent);
    expect(evento.ticketId).toBe('ticket-uuid');
    expect(evento.prioridadId).toBe('prioridad-alta-uuid');
  });

  it('SA10: NO publica evento si prioridadId no viene en el DTO (edición de otros campos)', async () => {
    const c = makeCollaborators(makeTicket());

    await c.useCase.execute({
      ticketId: 'ticket-uuid',
      titulo: 'Solo titulo',
      actorEsRoot: false,
    });

    expect(c.eventPublisher.publish).not.toHaveBeenCalled();
  });

  it('SA10: NO publica evento si prioridadId enviado es igual al actual (sin cambio real)', async () => {
    const c = makeCollaborators(makeTicket());

    await c.useCase.execute({
      ticketId: 'ticket-uuid',
      prioridadId: 'prioridad-media-uuid',
      actorEsRoot: false,
    });

    expect(c.eventPublisher.publish).not.toHaveBeenCalled();
  });

  it('SA10: un fallo del eventPublisher NUNCA revierte la edición ya persistida (log-and-swallow)', async () => {
    const c = makeCollaborators(makeTicket());
    c.eventPublisher.publish.mockImplementation(() => {
      throw new Error('boom');
    });

    const result = await c.useCase.execute({
      ticketId: 'ticket-uuid',
      prioridadId: 'prioridad-alta-uuid',
      actorEsRoot: false,
    });

    expect(result.isOk()).toBe(true);
    expect(c.ticketRepo.save).toHaveBeenCalledTimes(1);
  });

  // ─── Regla de bloqueo por estado (EN_PROCESO+ → solo ROOT) ────────────────
  describe('bloqueo de edición una vez EN_PROCESO (o posterior)', () => {
    it('EN_PROCESO + no-ROOT → TicketBloqueadoParaEdicionError (403), sin persistir', async () => {
      const c = makeCollaborators(makeTicket('estado-en-proceso-uuid'));

      const result = await c.useCase.execute({
        ticketId: 'ticket-uuid',
        titulo: 'Intento de edición',
        actorEsRoot: false,
      });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(TicketBloqueadoParaEdicionError);
      expect(c.ticketRepo.save).not.toHaveBeenCalled();
    });

    it('EN_PROCESO + ROOT → edita OK (ROOT bypassa el bloqueo)', async () => {
      const c = makeCollaborators(makeTicket('estado-en-proceso-uuid'));

      const result = await c.useCase.execute({
        ticketId: 'ticket-uuid',
        titulo: 'Editado por ROOT',
        actorEsRoot: true,
      });

      expect(result.isOk()).toBe(true);
      expect(result.getValue().titulo).toBe('Editado por ROOT');
      expect(c.ticketRepo.save).toHaveBeenCalledTimes(1);
    });

    it('ASIGNADO + no-ROOT → edita OK (sin regresión: pre-proceso sigue abierto a TECNICO+)', async () => {
      const c = makeCollaborators(makeTicket('estado-asignado-uuid'));

      const result = await c.useCase.execute({
        ticketId: 'ticket-uuid',
        titulo: 'Editado en ASIGNADO',
        actorEsRoot: false,
      });

      expect(result.isOk()).toBe(true);
      expect(result.getValue().titulo).toBe('Editado en ASIGNADO');
      expect(c.ticketRepo.save).toHaveBeenCalledTimes(1);
    });

    it('ROOT NO consulta el estado (bypass temprano, sin costo de findById)', async () => {
      const c = makeCollaborators(makeTicket('estado-en-proceso-uuid'));

      await c.useCase.execute({ ticketId: 'ticket-uuid', titulo: 'X', actorEsRoot: true });

      expect(c.estadoRepo.findById).not.toHaveBeenCalled();
    });
  });
});
