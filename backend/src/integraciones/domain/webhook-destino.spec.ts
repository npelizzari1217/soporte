import { esEventoWebhook, EVENTOS_WEBHOOK } from './webhook-destino';

describe('esEventoWebhook', () => {
  it('acepta los cuatro eventos de ticket', () => {
    expect(EVENTOS_WEBHOOK.every((e) => esEventoWebhook(e))).toBe(true);
  });

  it('rechaza eventos de SLA, valores desconocidos y no-strings', () => {
    expect(esEventoWebhook('SLA_VENCIDO')).toBe(false);
    expect(esEventoWebhook('ticket_creado')).toBe(false);
    expect(esEventoWebhook(undefined)).toBe(false);
    expect(esEventoWebhook(1)).toBe(false);
  });
});
