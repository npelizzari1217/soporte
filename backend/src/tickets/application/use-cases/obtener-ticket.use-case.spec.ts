/**
 * T6.3 [UNIT] — RED→GREEN: `ObtenerTicketUseCase` (T6 — scope por rol).
 *
 * Ref spec: sdd/tickets-core/spec T6. Tarea: T6.3.
 */
import { ObtenerTicketUseCase } from './obtener-ticket.use-case';
import { TicketEntity } from '../../domain/entities/ticket.entity';
import { TicketNoEncontradoError } from '../../domain/errors/tickets.errors';

function makeTicket(overrides: { solicitanteId?: string; id?: string } = {}): TicketEntity {
  return TicketEntity.create(
    {
      numero: 'SOP-2026-00001',
      titulo: 'Ticket de test',
      descripcion: null,
      tipoId: 'tipo-uuid',
      estadoId: 'estado-uuid',
      prioridadId: 'prioridad-uuid',
      cicloId: null,
      ticketReferenciaId: null,
      solicitanteId: overrides.solicitanteId ?? 'solicitante-uuid',
    },
    overrides.id ?? 'ticket-uuid',
  );
}

describe('ObtenerTicketUseCase', () => {
  function makeUseCase(ticket: TicketEntity | null) {
    const ticketRepo = { findById: vi.fn().mockResolvedValue(ticket) };
    const useCase = new ObtenerTicketUseCase(ticketRepo as never);
    return { useCase, ticketRepo };
  }

  it('actor con ticket:ver_todos puede ver cualquier ticket del tenant', async () => {
    const ticket = makeTicket({ solicitanteId: 'otro-usuario-uuid' });
    const { useCase } = makeUseCase(ticket);

    const result = await useCase.execute({
      ticketId: 'ticket-uuid',
      actorId: 'actor-uuid',
      tienePermisoVerTodos: true,
    });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().id).toBe('ticket-uuid');
  });

  it('actor SIN ver_todos ve su propio ticket (solicitante)', async () => {
    const ticket = makeTicket({ solicitanteId: 'actor-uuid' });
    const { useCase } = makeUseCase(ticket);

    const result = await useCase.execute({
      ticketId: 'ticket-uuid',
      actorId: 'actor-uuid',
      tienePermisoVerTodos: false,
    });

    expect(result.isOk()).toBe(true);
  });

  it('actor SIN ver_todos y NO es el solicitante → 404 (no revela existencia)', async () => {
    const ticket = makeTicket({ solicitanteId: 'otro-usuario-uuid' });
    const { useCase } = makeUseCase(ticket);

    const result = await useCase.execute({
      ticketId: 'ticket-uuid',
      actorId: 'actor-uuid',
      tienePermisoVerTodos: false,
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
  });

  it('ticket inexistente → TicketNoEncontradoError', async () => {
    const { useCase } = makeUseCase(null);

    const result = await useCase.execute({
      ticketId: 'no-existe',
      actorId: 'actor-uuid',
      tienePermisoVerTodos: true,
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
  });

  it('ticket soft-deleted se trata como inexistente → TicketNoEncontradoError', async () => {
    const ticket = makeTicket();
    ticket.softDelete();
    const { useCase } = makeUseCase(ticket);

    const result = await useCase.execute({
      ticketId: 'ticket-uuid',
      actorId: 'solicitante-uuid',
      tienePermisoVerTodos: true,
    });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(TicketNoEncontradoError);
  });
});
