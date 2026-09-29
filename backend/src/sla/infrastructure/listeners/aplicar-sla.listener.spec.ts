/**
 * SA12 [UNIT] — RED→GREEN: AplicarSlaListener — wiring @OnEvent →
 * AplicarSlaUseCase, con log-and-swallow (ADR-6/ADR-P8: un listener nunca
 * debe lanzar hacia el emisor síncrono). Desde D10 (sdd/feriados-configurables
 * WU5a, tarea 5.4) un fallo también queda registrado vía `ILogger.error`.
 *
 * Ref spec: sdd/premium/spec S2, S3; sdd/feriados-configurables "A failed
 * SLA calculation is logged, not silent". Ref design: ADR-P2, ADR-P8, D10.
 * Tarea: SA13, 5.4.
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
    const logger = {
      log: vi.fn(),
      error: vi.fn(),
    };
    const listener = new AplicarSlaListener(aplicarSlaUseCase as never, logger);
    return { listener, aplicarSlaUseCase, logger };
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

  it('[D10] onTicketCreado: un fallo se loguea una vez vía ILogger.error con ticket id + mensaje, sin objeto crudo', async () => {
    const { listener, aplicarSlaUseCase, logger } = makeListener();
    aplicarSlaUseCase.alCrear.mockRejectedValue(new Error('DB caída'));
    const event = new TicketCreadoEvent({ ticketId: 'ticket-1', prioridadId: 'prioridad-1' });

    await listener.onTicketCreado(event);

    expect(logger.error).toHaveBeenCalledTimes(1);
    const [mensaje] = logger.error.mock.calls[0] as [string];
    expect(mensaje).toContain('SLA_APLICAR_ERROR');
    expect(mensaje).toContain('evento=ticket.creado');
    expect(mensaje).toContain('ticket=ticket-1');
    expect(mensaje).toContain('DB caída');
    expect(mensaje).not.toContain('[object Object]');
    expect(mensaje).not.toContain('at ');
    expect(logger.log).not.toHaveBeenCalled();
  });

  it('[D10] onTicketReprioritizado: un fallo se loguea una vez vía ILogger.error con ticket id + mensaje, sin objeto crudo', async () => {
    const { listener, aplicarSlaUseCase, logger } = makeListener();
    aplicarSlaUseCase.alReprioritizar.mockRejectedValue(new Error('DB caída'));
    const event = new TicketReprioritizadoEvent({
      ticketId: 'ticket-2',
      prioridadId: 'prioridad-2',
    });

    await listener.onTicketReprioritizado(event);

    expect(logger.error).toHaveBeenCalledTimes(1);
    const [mensaje] = logger.error.mock.calls[0] as [string];
    expect(mensaje).toContain('SLA_APLICAR_ERROR');
    expect(mensaje).toContain('evento=ticket.reprioritizado');
    expect(mensaje).toContain('ticket=ticket-2');
    expect(mensaje).toContain('DB caída');
    expect(mensaje).not.toContain('[object Object]');
    expect(mensaje).not.toContain('at ');
    expect(logger.log).not.toHaveBeenCalled();
  });

  it('[D10] onTicketCreado: un rechazo sin Error (valor no-Error) loguea "error desconocido"', async () => {
    const { listener, aplicarSlaUseCase, logger } = makeListener();
    aplicarSlaUseCase.alCrear.mockRejectedValue('string plano, no Error');
    const event = new TicketCreadoEvent({ ticketId: 'ticket-3', prioridadId: 'prioridad-1' });

    await listener.onTicketCreado(event);

    expect(logger.error).toHaveBeenCalledTimes(1);
    const [mensaje] = logger.error.mock.calls[0] as [string];
    expect(mensaje).toContain('error desconocido');
  });

  it('happy path: ningún fallo no loguea nada', async () => {
    const { listener, logger } = makeListener();
    const event = new TicketCreadoEvent({ ticketId: 'ticket-4', prioridadId: 'prioridad-1' });

    await listener.onTicketCreado(event);

    expect(logger.error).not.toHaveBeenCalled();
  });
});
