/**
 * T6.5 [UNIT] — RED→GREEN: `EditarTicketUseCase` (T8 — titulo/descripcion/
 * prioridad, NUNCA estado).
 *
 * Ref spec: sdd/tickets-core/spec T8. Tarea: T6.5.
 */
import { EditarTicketUseCase } from './editar-ticket.use-case';
import { TicketEntity } from '../../domain/entities/ticket.entity';
import { PrioridadEntity } from '../../domain/entities/prioridad.entity';
import { TicketReprioritizadoEvent } from '../../domain/events/ticket-reprioritizado.event';
import {
  TicketNoEncontradoError,
  PrioridadNoEncontradaError,
} from '../../domain/errors/tickets.errors';

function makeTicket(): TicketEntity {
  return TicketEntity.create(
    {
      numero: 'SOP-2026-00001',
      titulo: 'Titulo original',
      descripcion: 'Descripcion original',
      tipoId: 'tipo-uuid',
      estadoId: 'estado-nuevo-uuid',
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
    const eventPublisher = { publish: vi.fn() };
    const useCase = new EditarTicketUseCase(
      ticketRepo as never,
      prioridadRepo as never,
      eventPublisher as never,
    );
    return { useCase, ticketRepo, prioridadRepo, eventPublisher };
  }

  it('actualiza titulo/descripcion/prioridadId y persiste', async () => {
    const c = makeCollaborators(makeTicket());

    const result = await c.useCase.execute({
      ticketId: 'ticket-uuid',
      titulo: 'Nuevo titulo',
      descripcion: 'Nueva descripcion',
      prioridadId: 'prioridad-alta-uuid',
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

    const result = await c.useCase.execute({ ticketId: 'ticket-uuid', titulo: 'X' });

    expect(result.getValue().estadoId).toBe('estado-nuevo-uuid');
  });

  it('campos omitidos no se tocan (PATCH parcial)', async () => {
    const c = makeCollaborators(makeTicket());

    const result = await c.useCase.execute({ ticketId: 'ticket-uuid', titulo: 'Solo titulo' });

    expect(result.getValue().descripcion).toBe('Descripcion original');
    expect(result.getValue().prioridadId).toBe('prioridad-media-uuid');
  });

  it('ticket inexistente → TicketNoEncontradoError (404)', async () => {
    const c = makeCollaborators(null);

    const result = await c.useCase.execute({ ticketId: 'no-existe', titulo: 'X' });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
  });

  it('ticket soft-deleted se trata como inexistente → TicketNoEncontradoError (404)', async () => {
    const ticket = makeTicket();
    ticket.softDelete();
    const c = makeCollaborators(ticket);

    const result = await c.useCase.execute({ ticketId: 'ticket-uuid', titulo: 'X' });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
  });

  it('prioridadId inexistente en el catálogo del tenant → PrioridadNoEncontradaError (422), sin persistir', async () => {
    const c = makeCollaborators(makeTicket());
    c.prioridadRepo.findById.mockResolvedValue(null);

    const result = await c.useCase.execute({ ticketId: 'ticket-uuid', prioridadId: 'no-existe' });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(PrioridadNoEncontradaError);
    expect(c.ticketRepo.save).not.toHaveBeenCalled();
  });

  it('SA10 (Fase 4, aditivo, GATE G3): publica TicketReprioritizadoEvent SOLO si prioridadId cambia', async () => {
    const c = makeCollaborators(makeTicket());

    await c.useCase.execute({ ticketId: 'ticket-uuid', prioridadId: 'prioridad-alta-uuid' });

    expect(c.eventPublisher.publish).toHaveBeenCalledTimes(1);
    const evento = c.eventPublisher.publish.mock.calls[0][0];
    expect(evento).toBeInstanceOf(TicketReprioritizadoEvent);
    expect(evento.ticketId).toBe('ticket-uuid');
    expect(evento.prioridadId).toBe('prioridad-alta-uuid');
  });

  it('SA10: NO publica evento si prioridadId no viene en el DTO (edición de otros campos)', async () => {
    const c = makeCollaborators(makeTicket());

    await c.useCase.execute({ ticketId: 'ticket-uuid', titulo: 'Solo titulo' });

    expect(c.eventPublisher.publish).not.toHaveBeenCalled();
  });

  it('SA10: NO publica evento si prioridadId enviado es igual al actual (sin cambio real)', async () => {
    const c = makeCollaborators(makeTicket());

    await c.useCase.execute({ ticketId: 'ticket-uuid', prioridadId: 'prioridad-media-uuid' });

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
    });

    expect(result.isOk()).toBe(true);
    expect(c.ticketRepo.save).toHaveBeenCalledTimes(1);
  });
});
