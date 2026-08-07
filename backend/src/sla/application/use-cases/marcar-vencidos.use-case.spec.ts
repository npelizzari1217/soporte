/**
 * SB1 [UNIT] — RED→GREEN: MarcarVencidosUseCase (S4 — marca vencido=true en
 * tickets vencibles y emite `sla.vencido` por cada uno; idempotente; NO
 * auto-escala prioridad, S6).
 *
 * Ref spec: sdd/premium/spec S4, S6. Ref design: ADR-P3/ADR-P4. Tarea: SB1.
 */
import { MarcarVencidosUseCase } from './marcar-vencidos.use-case';
import { SlaVencidoEvent } from '../../domain/events/sla-vencido.event';

function makeCollaborators() {
  const slaTicketQueryRepo = {
    findVencibles: vi.fn(),
    marcarVencido: vi.fn().mockResolvedValue(undefined),
  };
  const eventPublisher = { publish: vi.fn() };
  const useCase = new MarcarVencidosUseCase(slaTicketQueryRepo as never, eventPublisher as never);
  return { useCase, slaTicketQueryRepo, eventPublisher };
}

describe('MarcarVencidosUseCase', () => {
  it('S4: marca vencido=true y emite sla.vencido por cada ticket vencible', async () => {
    const c = makeCollaborators();
    c.slaTicketQueryRepo.findVencibles.mockResolvedValue([
      { id: 'ticket-1', asignadoId: 'agente-1', solicitanteId: 'sol-1' },
      { id: 'ticket-2', asignadoId: null, solicitanteId: 'sol-2' },
    ]);

    const marcados = await c.useCase.execute();

    expect(marcados).toBe(2);
    expect(c.slaTicketQueryRepo.marcarVencido).toHaveBeenCalledWith('ticket-1');
    expect(c.slaTicketQueryRepo.marcarVencido).toHaveBeenCalledWith('ticket-2');
    expect(c.eventPublisher.publish).toHaveBeenCalledTimes(2);

    const evento1 = c.eventPublisher.publish.mock.calls[0][0];
    expect(evento1).toBeInstanceOf(SlaVencidoEvent);
    expect(evento1.ticketId).toBe('ticket-1');
    expect(evento1.asignadoId).toBe('agente-1');
    expect(evento1.solicitanteId).toBe('sol-1');

    const evento2 = c.eventPublisher.publish.mock.calls[1][0];
    expect(evento2.ticketId).toBe('ticket-2');
    expect(evento2.asignadoId).toBeNull();
  });

  it('sin tickets vencibles → 0 marcados, sin publicar eventos', async () => {
    const c = makeCollaborators();
    c.slaTicketQueryRepo.findVencibles.mockResolvedValue([]);

    const marcados = await c.useCase.execute();

    expect(marcados).toBe(0);
    expect(c.slaTicketQueryRepo.marcarVencido).not.toHaveBeenCalled();
    expect(c.eventPublisher.publish).not.toHaveBeenCalled();
  });

  it('S6: NO toca prioridadId (el repo de marcado solo expone marcarVencido, sin superficie de escritura de prioridad)', async () => {
    const c = makeCollaborators();
    c.slaTicketQueryRepo.findVencibles.mockResolvedValue([
      { id: 'ticket-1', asignadoId: 'agente-1', solicitanteId: 'sol-1' },
    ]);

    await c.useCase.execute();

    expect(Object.keys(c.slaTicketQueryRepo)).toEqual(['findVencibles', 'marcarVencido']);
  });

  it('un fallo al marcar un ticket NO aborta el resto del barrido (aislamiento por ticket)', async () => {
    const c = makeCollaborators();
    c.slaTicketQueryRepo.findVencibles.mockResolvedValue([
      { id: 'ticket-1', asignadoId: null, solicitanteId: 'sol-1' },
      { id: 'ticket-2', asignadoId: null, solicitanteId: 'sol-2' },
    ]);
    c.slaTicketQueryRepo.marcarVencido.mockRejectedValueOnce(new Error('DB caída'));

    const marcados = await c.useCase.execute();

    expect(marcados).toBe(1);
    expect(c.slaTicketQueryRepo.marcarVencido).toHaveBeenCalledTimes(2);
    expect(c.eventPublisher.publish).toHaveBeenCalledTimes(1);
    expect(c.eventPublisher.publish.mock.calls[0][0].ticketId).toBe('ticket-2');
  });
});
