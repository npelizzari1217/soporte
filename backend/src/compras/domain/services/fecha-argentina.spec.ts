import { describe, it, expect, vi, afterEach } from 'vitest';
import { hoyArgentina, soloFecha } from './fecha-argentina';

/**
 * WU-19 [UNIT] — RED→GREEN: `hoyArgentina`/`soloFecha` (R5/S53,
 * `resoluciones-pre-apply`).
 *
 * R-10 del design (permisividad de un día cerca de medianoche AR): fija el
 * reloj a las 23:00 de Argentina (02:00 UTC del día siguiente) y verifica
 * que `hoyArgentina()` devuelve el día LOCAL, no el día UTC ya adelantado —
 * es el caso concreto que demuestra por qué ADR-T4 (validar contra
 * `hoyUTC()`) quedó superado.
 */
describe('hoyArgentina/soloFecha — R5/S53', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('soloFecha trunca la hora, dejando medianoche UTC del mismo día calendario', () => {
    const conHora = new Date('2026-08-17T15:42:00.000Z');
    expect(soloFecha(conHora)).toEqual(new Date('2026-08-17T00:00:00.000Z'));
  });

  it('hoyArgentina devuelve el día UTC cuando la hora local AR está lejos de medianoche', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-17T14:00:00.000Z')); // 11:00 AR
    expect(hoyArgentina()).toEqual(new Date('2026-08-17T00:00:00.000Z'));
  });

  it('LA TRAMPA QUE SUPERA ADR-T4: a las 23:00 AR (02:00 UTC del día siguiente), hoyArgentina() sigue en el día LOCAL, no en el UTC ya adelantado', () => {
    vi.useFakeTimers();
    // 2026-08-18T02:00:00Z UTC == 2026-08-17T23:00:00 en Argentina (UTC-3).
    vi.setSystemTime(new Date('2026-08-18T02:00:00.000Z'));

    const hoyUTCIngenuo = new Date(
      Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()),
    );

    // hoyUTC() ingenuo ya está en 08-18 — exactamente el artefacto de
    // ADR-T4 que la resolución declaró superado.
    expect(hoyUTCIngenuo).toEqual(new Date('2026-08-18T00:00:00.000Z'));
    // hoyArgentina() se queda en 08-17: es el día que un usuario en
    // Argentina ve en este instante.
    expect(hoyArgentina()).toEqual(new Date('2026-08-17T00:00:00.000Z'));
  });
});
