import { describe, it, expect } from 'vitest';
import {
  claveDiaCalendario,
  esOrigenValoracionEquipo,
  valoracionDelGuardado,
} from './valoracion-equipo';

/** Fecha de calendario como la devuelve Prisma para una columna `@db.Date`: medianoche UTC. */
const dia = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

describe('valoracionDelGuardado (S2)', () => {
  it('en el alta registra el valor residual cuando tiene monto y fecha', () => {
    expect(
      valoracionDelGuardado(null, {
        valorResidual: 700,
        fechaValorResidual: dia('2026-10-24'),
      }),
    ).toEqual({ fecha: dia('2026-10-24'), importe: 700 });
  });

  it('en el alta no registra nada sin monto o sin fecha', () => {
    expect(
      valoracionDelGuardado(null, { valorResidual: 700, fechaValorResidual: null }),
    ).toBeNull();
    expect(
      valoracionDelGuardado(null, { valorResidual: null, fechaValorResidual: dia('2026-10-24') }),
    ).toBeNull();
  });

  it('registra cuando cambia el monto, aunque la fecha sea la misma (S3 la reemplaza)', () => {
    expect(
      valoracionDelGuardado(
        { valorResidual: 700, fechaValorResidual: dia('2026-10-24') },
        { valorResidual: 490, fechaValorResidual: dia('2026-10-24') },
      ),
    ).toEqual({ fecha: dia('2026-10-24'), importe: 490 });
  });

  it('registra cuando cambia solo la fecha', () => {
    expect(
      valoracionDelGuardado(
        { valorResidual: 700, fechaValorResidual: dia('2026-10-24') },
        { valorResidual: 700, fechaValorResidual: dia('2026-11-01') },
      ),
    ).toEqual({ fecha: dia('2026-11-01'), importe: 700 });
  });

  it('registra cuando el equipo no tenía valor residual y ahora sí', () => {
    expect(
      valoracionDelGuardado(
        { valorResidual: null, fechaValorResidual: null },
        { valorResidual: 0, fechaValorResidual: dia('2026-10-24') },
      ),
    ).toEqual({ fecha: dia('2026-10-24'), importe: 0 });
  });

  it('no registra nada si el monto y el día no cambian', () => {
    expect(
      valoracionDelGuardado(
        { valorResidual: 700, fechaValorResidual: dia('2026-10-24') },
        { valorResidual: 700, fechaValorResidual: dia('2026-10-24') },
      ),
    ).toBeNull();
  });

  it('compara por día de calendario: la misma fecha con hora no cuenta como cambio', () => {
    expect(
      valoracionDelGuardado(
        { valorResidual: 700, fechaValorResidual: dia('2026-10-24') },
        { valorResidual: 700, fechaValorResidual: new Date('2026-10-24T15:30:00.000Z') },
      ),
    ).toBeNull();
  });

  it('no registra nada si el usuario vacía el valor residual', () => {
    const anterior = { valorResidual: 700, fechaValorResidual: dia('2026-10-24') };
    expect(
      valoracionDelGuardado(anterior, { valorResidual: null, fechaValorResidual: null }),
    ).toBeNull();
    expect(
      valoracionDelGuardado(anterior, {
        valorResidual: null,
        fechaValorResidual: dia('2026-10-24'),
      }),
    ).toBeNull();
    expect(
      valoracionDelGuardado(anterior, { valorResidual: 490, fechaValorResidual: null }),
    ).toBeNull();
  });
});

describe('claveDiaCalendario', () => {
  it('lee el día en componentes UTC, no en la zona del proceso', () => {
    // El runner fija TZ=America/Argentina/Buenos_Aires: con getters locales sería el 23.
    expect(claveDiaCalendario(dia('2026-10-24'))).toBe('2026-10-24');
  });
});

describe('esOrigenValoracionEquipo', () => {
  it('acepta solo los orígenes del catálogo', () => {
    expect(esOrigenValoracionEquipo('MANUAL')).toBe(true);
    expect(esOrigenValoracionEquipo('MIGRACION')).toBe(true);
    expect(esOrigenValoracionEquipo('manual')).toBe(false);
    expect(esOrigenValoracionEquipo(null)).toBe(false);
  });
});
