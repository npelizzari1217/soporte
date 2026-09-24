/**
 * prisma-calendario-laboral.mapper.spec.ts — WU-2 (sdd/sla-habil).
 *
 * Unit, sin DB. Cubre las dos conversiones de la trampa de este WU:
 * - `toCalendarioSemanal`: 7 filas de Prisma → tupla `CalendarioLaboralSemanal`
 *   (índice 0 = domingo), y qué pasa si faltan filas.
 * - `toFeriados`: la columna `@db.Date` de `Feriado.fecha` → clave local
 *   `'YYYY-MM-DD'`, LEYENDO COMPONENTES UTC — nunca `desplazarAArgentina`.
 */
import { describe, expect, it } from 'vitest';
import { PrismaCalendarioLaboralMapper } from './prisma-calendario-laboral.mapper';

/** Fila mínima de `CalendarioLaboralDia` que el mapper necesita. */
function filaDia(
  diaSemana: number,
  aperturaMinuto: number | null,
  cierreMinuto: number | null,
): { diaSemana: number; aperturaMinuto: number | null; cierreMinuto: number | null } {
  return { diaSemana, aperturaMinuto, cierreMinuto };
}

// El viernes cierra ANTES que el resto a propósito: sin esa asimetría el
// fixture es palindrómico en valores (0 y 6 cerrados, 1 a 5 idénticos) y un
// mapeo posicional en vez de por `diaSemana` devolvería exactamente lo mismo
// al revertir el orden. El test de filas desordenadas no podría fallar.
const FILAS_COMPLETAS = [
  filaDia(0, null, null),
  filaDia(1, 540, 1080),
  filaDia(2, 540, 1080),
  filaDia(3, 540, 1080),
  filaDia(4, 540, 1080),
  filaDia(5, 540, 780),
  filaDia(6, null, null),
];

describe('PrismaCalendarioLaboralMapper.toCalendarioSemanal', () => {
  it('mapea las 7 filas a la tupla semanal, índice 0 = domingo', () => {
    const semanal = PrismaCalendarioLaboralMapper.toCalendarioSemanal(FILAS_COMPLETAS);

    expect(semanal[0]).toEqual({ aperturaMinuto: null, cierreMinuto: null });
    expect(semanal[1]).toEqual({ aperturaMinuto: 540, cierreMinuto: 1080 });
    expect(semanal[5]).toEqual({ aperturaMinuto: 540, cierreMinuto: 780 });
    expect(semanal[6]).toEqual({ aperturaMinuto: null, cierreMinuto: null });
  });

  it('arma la tupla aunque las filas lleguen desordenadas', () => {
    const desordenadas = [...FILAS_COMPLETAS].reverse();
    const semanal = PrismaCalendarioLaboralMapper.toCalendarioSemanal(desordenadas);

    // El viernes es el que discrimina: con un mapeo posicional, el índice 5
    // recibiría la ventana del martes (540-1080) en vez de la suya (540-780).
    expect(semanal[5]).toEqual({ aperturaMinuto: 540, cierreMinuto: 780 });
    expect(semanal[1]).toEqual({ aperturaMinuto: 540, cierreMinuto: 1080 });
    expect(semanal[0]).toEqual({ aperturaMinuto: null, cierreMinuto: null });
  });

  it('lanza si falta una fila (6 de 7, falta el miércoles)', () => {
    const incompletas = FILAS_COMPLETAS.filter((fila) => fila.diaSemana !== 3);

    expect(() => PrismaCalendarioLaboralMapper.toCalendarioSemanal(incompletas)).toThrow(/3/);
  });

  it('lanza si la base no tiene ninguna fila', () => {
    expect(() => PrismaCalendarioLaboralMapper.toCalendarioSemanal([])).toThrow(
      /calendario_laboral_dias/,
    );
  });
});

describe('PrismaCalendarioLaboralMapper.toFeriados', () => {
  it('convierte la medianoche UTC del 1 de enero a la clave local del MISMO día', () => {
    // Prisma devuelve @db.Date como medianoche UTC del día calendario.
    // Aplicar `desplazarAArgentina` restaría 3hs y caería en 2025-12-31 —
    // el caso que este test tiene que hacer fallar si alguien lo introduce.
    const filas = [{ fecha: new Date(Date.UTC(2026, 0, 1, 0, 0, 0)) }];

    const feriados = PrismaCalendarioLaboralMapper.toFeriados(filas);

    expect(feriados.has('2026-01-01')).toBe(true);
    expect(feriados.has('2025-12-31')).toBe(false);
    expect(feriados.size).toBe(1);
  });

  it('convierte varias fechas conservando cada una como clave propia', () => {
    const filas = [
      { fecha: new Date(Date.UTC(2026, 4, 1)) }, // 1 de mayo
      { fecha: new Date(Date.UTC(2026, 6, 9)) }, // 9 de julio
    ];

    const feriados = PrismaCalendarioLaboralMapper.toFeriados(filas);

    expect(feriados).toEqual(new Set(['2026-05-01', '2026-07-09']));
  });
});

describe('PrismaCalendarioLaboralMapper.claveDiaUtcDe (WU1, ahora público)', () => {
  it('mapea la medianoche UTC escrita por FechaCalendario.aDateUtc() al mismo día calendario', () => {
    // Ronda completa de la trampa @db.Date (D2): FechaCalendario.aDateUtc()
    // escribe `…T00:00:00.000Z`; leerlo con desplazarAArgentina restaría 3hs
    // y caería en 2026-12-24 — el caso que este test hace fallar si alguien
    // lo introduce en el mapper de feriados globales (PrismaFeriadoGlobalMapper).
    const medianocheUtc = new Date('2026-12-25T00:00:00.000Z');

    expect(PrismaCalendarioLaboralMapper.claveDiaUtcDe(medianocheUtc)).toBe('2026-12-25');
  });
});
