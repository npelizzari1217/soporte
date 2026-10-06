import {
  CalcularSlaHabilVenceService,
  CalendarioLaboralSemanal,
} from '../../../calendario-laboral/domain/services/calcular-sla-habil-vence.service';
import { promedioHorasHabiles } from './promedio-horas-habiles';

const CALENDARIO_L_A_V_9_A_18: CalendarioLaboralSemanal = [
  { aperturaMinuto: null, cierreMinuto: null },
  { aperturaMinuto: 540, cierreMinuto: 1080 },
  { aperturaMinuto: 540, cierreMinuto: 1080 },
  { aperturaMinuto: 540, cierreMinuto: 1080 },
  { aperturaMinuto: 540, cierreMinuto: 1080 },
  { aperturaMinuto: 540, cierreMinuto: 1080 },
  { aperturaMinuto: null, cierreMinuto: null },
];

describe('promedioHorasHabiles (dashboard-metricas-sla R2)', () => {
  const calculo = new CalcularSlaHabilVenceService();
  const promedio = (tramos: [string, string][], feriados: string[] = []) =>
    promedioHorasHabiles(
      tramos.map(([d, h]) => ({ desde: new Date(d), hasta: new Date(h) })),
      calculo,
      CALENDARIO_L_A_V_9_A_18,
      new Set(feriados),
    );

  // Hora local argentina = UTC-3: viernes 17:00 = 20:00Z, lunes 10:00 = 13:00Z.
  const VIERNES_17 = '2026-08-07T20:00:00.000Z';

  it('viernes 17:00 respondido lunes 10:00 (2 h hábiles) y respondido 17:30 (0,5 h) dan 1,25 h', () => {
    expect(
      promedio([
        [VIERNES_17, '2026-08-10T13:00:00.000Z'],
        [VIERNES_17, '2026-08-07T20:30:00.000Z'],
      ]),
    ).toBeCloseTo(1.25, 10);
  });

  it('no es tiempo de pared: el lunes de 10:00 son 65 h corridas y solo 2 h hábiles', () => {
    expect(promedio([[VIERNES_17, '2026-08-10T13:00:00.000Z']])).toBeCloseTo(2, 10);
  });

  it('un feriado entre medio no suma', () => {
    expect(promedio([[VIERNES_17, '2026-08-11T13:00:00.000Z']], ['2026-08-10'])).toBeCloseTo(2, 10);
  });

  it('sin tramos devuelve null, no 0', () => {
    expect(promedio([])).toBeNull();
  });
});
