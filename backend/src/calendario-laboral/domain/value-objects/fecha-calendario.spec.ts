import { describe, expect, it } from 'vitest';
import { FechaCalendario } from './fecha-calendario';

describe('FechaCalendario.crear', () => {
  it('acepta una fecha real bisiesta (29 de febrero de 2028)', () => {
    const resultado = FechaCalendario.crear('2028-02-29');

    expect(resultado.isOk()).toBe(true);
    expect(resultado.getValue().aClave()).toBe('2028-02-29');
  });

  it('rechaza una fecha que no existe en el calendario (30 de febrero)', () => {
    const resultado = FechaCalendario.crear('2026-02-30');

    expect(resultado.isFail()).toBe(true);
    expect(resultado.getError().code).toBe('FECHA_CALENDARIO_INVALIDA');
  });

  it('rechaza el 29 de febrero de un año NO bisiesto', () => {
    const resultado = FechaCalendario.crear('2026-02-29');

    expect(resultado.isFail()).toBe(true);
  });

  it('rechaza strings vacíos, mal formados, o con hora/offset (@IsDateString los aceptaría)', () => {
    expect(FechaCalendario.crear('').isFail()).toBe(true);
    expect(FechaCalendario.crear('12-25-2026').isFail()).toBe(true);
    expect(FechaCalendario.crear('2026-13-01').isFail()).toBe(true);
    expect(FechaCalendario.crear('2026-10-12T02:00:00-03:00').isFail()).toBe(true);
  });
});

describe('FechaCalendario.aDateUtc', () => {
  it('produce la medianoche UTC del mismo día calendario, apta para @db.Date', () => {
    const fecha = FechaCalendario.crear('2026-12-25').getValue();

    expect(fecha.aDateUtc().toISOString()).toBe('2026-12-25T00:00:00.000Z');
  });
});

describe('FechaCalendario.equals', () => {
  it('compara por valor, no por referencia', () => {
    const a = FechaCalendario.crear('2026-01-01').getValue();
    const b = FechaCalendario.crear('2026-01-01').getValue();
    const c = FechaCalendario.crear('2026-01-02').getValue();

    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
  });
});
