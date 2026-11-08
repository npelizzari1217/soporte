/**
 * [UNIT] Bordes del filtro Desde/Hasta del listado de tickets (odd/autor-y-filtro-fechas, S2):
 * una fecha sola es un día argentino entero (UTC-3); un instante ISO completo no cambia.
 */
import { instanteDesde, instanteHasta } from './filtro-fechas';

describe('filtro de fechas de tickets', () => {
  it('Desde con una fecha sola empieza a las 00:00 ART de ese día', () => {
    expect(instanteDesde('2026-01-01')?.toISOString()).toBe('2026-01-01T03:00:00.000Z');
  });

  it('Hasta con una fecha sola incluye el día entero en Argentina', () => {
    expect(instanteHasta('2026-12-31')?.toISOString()).toBe('2027-01-01T02:59:59.999Z');
  });

  it('un ticket creado a las 23:30 ART del último día entra; uno a las 00:00 ART del siguiente no', () => {
    const hasta = instanteHasta('2026-12-31') as Date;

    expect(new Date('2027-01-01T02:30:00.000Z') <= hasta).toBe(true);
    expect(new Date('2027-01-01T03:00:00.000Z') <= hasta).toBe(false);
  });

  it('un ticket creado a las 22:00 ART del día anterior a Desde no entra', () => {
    const desde = instanteDesde('2026-01-01') as Date;

    expect(new Date('2026-01-01T01:00:00.000Z') >= desde).toBe(false);
  });

  it('un instante ISO completo se respeta tal cual, en los dos bordes', () => {
    expect(instanteDesde('2026-03-10T12:00:00.000Z')?.toISOString()).toBe(
      '2026-03-10T12:00:00.000Z',
    );
    expect(instanteHasta('2026-03-10T12:00:00.000Z')?.toISOString()).toBe(
      '2026-03-10T12:00:00.000Z',
    );
  });

  it('sin valor no filtra', () => {
    expect(instanteDesde(undefined)).toBeUndefined();
    expect(instanteHasta(undefined)).toBeUndefined();
  });
});
