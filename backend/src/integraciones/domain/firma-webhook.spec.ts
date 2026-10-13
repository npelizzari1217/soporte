import { createHmac } from 'node:crypto';
import {
  ENCABEZADO_ENTREGA_WEBHOOK,
  ENCABEZADO_EVENTO_WEBHOOK,
  ENCABEZADO_FIRMA_WEBHOOK,
  ENCABEZADO_TIMESTAMP_WEBHOOK,
  firmarWebhook,
  generarSecretoWebhook,
  PREFIJO_SECRETO_WEBHOOK,
} from './firma-webhook';

describe('firmarWebhook', () => {
  it('coincide con un vector conocido (calculado con openssl)', () => {
    // printf '%s' '1700000000.{"evento":"TICKET_CREADO"}' | openssl dgst -sha256 -hmac 'whsec_prueba'
    expect(firmarWebhook('whsec_prueba', 1700000000, '{"evento":"TICKET_CREADO"}')).toBe(
      '9712e9717632808561a973a08bb97c091f87ea3365512af271fdffd3831b1363',
    );
  });

  it('firma `<timestamp>.<cuerpo>`, no el cuerpo solo', () => {
    const firma = firmarWebhook('s', 10, 'x');
    expect(firma).toBe(createHmac('sha256', 's').update('10.x').digest('hex'));
    expect(firma).not.toBe(createHmac('sha256', 's').update('x').digest('hex'));
  });

  it('cambia si cambia el secreto, el timestamp o el cuerpo', () => {
    const base = firmarWebhook('a', 1, 'b');
    expect(firmarWebhook('z', 1, 'b')).not.toBe(base);
    expect(firmarWebhook('a', 2, 'b')).not.toBe(base);
    expect(firmarWebhook('a', 1, 'c')).not.toBe(base);
  });
});

describe('generarSecretoWebhook', () => {
  it('lleva el prefijo `whsec_` y 32 bytes en base64url', () => {
    const secreto = generarSecretoWebhook();
    expect(secreto.startsWith(PREFIJO_SECRETO_WEBHOOK)).toBe(true);
    expect(secreto.slice(PREFIJO_SECRETO_WEBHOOK.length)).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('dos secretos generados nunca coinciden', () => {
    const secretos = new Set(Array.from({ length: 50 }, () => generarSecretoWebhook()));
    expect(secretos.size).toBe(50);
  });
});

describe('encabezados', () => {
  it('comparten el prefijo X-Soporte- y no se repiten', () => {
    const nombres = [
      ENCABEZADO_FIRMA_WEBHOOK,
      ENCABEZADO_TIMESTAMP_WEBHOOK,
      ENCABEZADO_EVENTO_WEBHOOK,
      ENCABEZADO_ENTREGA_WEBHOOK,
    ];
    expect(nombres.every((n) => n.startsWith('X-Soporte-'))).toBe(true);
    expect(new Set(nombres.map((n) => n.toLowerCase())).size).toBe(4);
  });
});
