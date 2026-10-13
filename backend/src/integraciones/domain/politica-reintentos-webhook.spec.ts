import {
  calcularProximoIntento,
  ESPERAS_REINTENTO_WEBHOOK_MS,
} from './politica-reintentos-webhook';

const AHORA = new Date('2026-10-13T12:00:00.000Z');
const MINUTO = 60_000;

describe('calcularProximoIntento', () => {
  it('tras el primer intento espera 1 minuto', () => {
    expect(calcularProximoIntento(1, AHORA)).toEqual(new Date(AHORA.getTime() + MINUTO));
  });

  it('sigue la agenda fija: 1m, 5m, 15m, 30m, 1h, 2h, 4h, 8h, 8h', () => {
    const minutos = ESPERAS_REINTENTO_WEBHOOK_MS.map((ms) => ms / MINUTO);
    expect(minutos).toEqual([1, 5, 15, 30, 60, 120, 240, 480, 480]);
    minutos.forEach((m, i) => {
      expect(calcularProximoIntento(i + 1, AHORA)?.getTime()).toBe(AHORA.getTime() + m * MINUTO);
    });
  });

  it('la ventana total queda por debajo de 24 h y por encima de 23 h', () => {
    const total = ESPERAS_REINTENTO_WEBHOOK_MS.reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(23 * 60 * MINUTO);
    expect(total).toBeLessThanOrEqual(24 * 60 * MINUTO);
  });

  it('el último reintento agendado es tras el intento 9; tras el 10 devuelve null', () => {
    const n = ESPERAS_REINTENTO_WEBHOOK_MS.length;
    expect(calcularProximoIntento(n, AHORA)).not.toBeNull();
    expect(calcularProximoIntento(n + 1, AHORA)).toBeNull();
    expect(calcularProximoIntento(n + 50, AHORA)).toBeNull();
  });

  it('no muta la fecha recibida', () => {
    const ahora = new Date(AHORA);
    calcularProximoIntento(3, ahora);
    expect(ahora).toEqual(AHORA);
  });

  it('rechaza intentos que no son enteros >= 1', () => {
    expect(() => calcularProximoIntento(0, AHORA)).toThrow(RangeError);
    expect(() => calcularProximoIntento(-1, AHORA)).toThrow(RangeError);
    expect(() => calcularProximoIntento(1.5, AHORA)).toThrow(RangeError);
    expect(() => calcularProximoIntento(Number.NaN, AHORA)).toThrow(RangeError);
  });
});
