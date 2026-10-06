import { TicketTransicionadoEvent } from '../../../tickets/domain/events/ticket-transicionado.event';
import { RelojSlaListener } from './reloj-sla.listener';

const evento = new TicketTransicionadoEvent({
  ticketId: 't1',
  estadoAnteriorCodigo: 'EN_PROCESO',
  estadoNuevoCodigo: 'ESPERANDO_CLIENTE',
});

describe('RelojSlaListener', () => {
  it('consolida el ticket del evento', async () => {
    const execute = vi.fn().mockResolvedValue('consolidado');

    await new RelojSlaListener({ execute }, { log: vi.fn(), error: vi.fn() }).onTicketTransicionado(
      evento,
    );

    expect(execute).toHaveBeenCalledWith('t1');
  });

  it('log-and-swallow: un fallo se registra como SLA_RELOJ_ERROR y no se propaga', async () => {
    const logger = { log: vi.fn(), error: vi.fn() };
    const listener = new RelojSlaListener(
      { execute: vi.fn().mockRejectedValue(new Error('MASTER caído')) },
      logger,
    );

    await expect(listener.onTicketTransicionado(evento)).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('SLA_RELOJ_ERROR'));
  });
});
