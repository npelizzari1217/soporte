/**
 * SA12 [UNIT] — RED→GREEN: AplicarSlaListener — wiring @OnEvent →
 * AplicarSlaUseCase, con log-and-swallow (ADR-6/ADR-P8: un listener nunca
 * debe lanzar hacia el emisor síncrono).
 *
 * Ref spec: sdd/premium/spec S2, S3. Ref design: ADR-P2, ADR-P8. Tarea: SA13.
 */
import { AplicarSlaListener } from './aplicar-sla.listener';
import { TicketCreadoEvent } from '../../../tickets/domain/events/ticket-creado.event';
import { TicketReprioritizadoEvent } from '../../../tickets/domain/events/ticket-reprioritizado.event';

describe('AplicarSlaListener', () => {
  function makeListener() {
    const aplicarSlaUseCase = {
      alCrear: vi.fn().mockResolvedValue(undefined),
      alReprioritizar: vi.fn().mockResolvedValue(undefined),
    };
    const listener = new AplicarSlaListener(aplicarSlaUseCase as never);
    return { listener, aplicarSlaUseCase };
  }

  it('onTicketCreado delega en AplicarSlaUseCase.alCrear con ticketId/prioridadId', async () => {
    const { listener, aplicarSlaUseCase } = makeListener();
    const event = new TicketCreadoEvent({ ticketId: 'ticket-1', prioridadId: 'prioridad-1' });

    await listener.onTicketCreado(event);

    expect(aplicarSlaUseCase.alCrear).toHaveBeenCalledWith({
      ticketId: 'ticket-1',
      prioridadId: 'prioridad-1',
    });
  });

  it('onTicketReprioritizado delega en AplicarSlaUseCase.alReprioritizar', async () => {
    const { listener, aplicarSlaUseCase } = makeListener();
    const event = new TicketReprioritizadoEvent({
      ticketId: 'ticket-2',
      prioridadId: 'prioridad-2',
    });

    await listener.onTicketReprioritizado(event);

    expect(aplicarSlaUseCase.alReprioritizar).toHaveBeenCalledWith({
      ticketId: 'ticket-2',
      prioridadId: 'prioridad-2',
    });
  });

  it('[CRITICAL] onTicketCreado: un fallo del use case NUNCA se propaga (log-and-swallow)', async () => {
    const { listener, aplicarSlaUseCase } = makeListener();
    aplicarSlaUseCase.alCrear.mockRejectedValue(new Error('DB caída'));
    const event = new TicketCreadoEvent({ ticketId: 'ticket-1', prioridadId: 'prioridad-1' });

    await expect(listener.onTicketCreado(event)).resolves.toBeUndefined();
  });

  it('[CRITICAL] onTicketReprioritizado: un fallo del use case NUNCA se propaga (log-and-swallow)', async () => {
    const { listener, aplicarSlaUseCase } = makeListener();
    aplicarSlaUseCase.alReprioritizar.mockRejectedValue(new Error('DB caída'));
    const event = new TicketReprioritizadoEvent({
      ticketId: 'ticket-2',
      prioridadId: 'prioridad-2',
    });

    await expect(listener.onTicketReprioritizado(event)).resolves.toBeUndefined();
  });
});
