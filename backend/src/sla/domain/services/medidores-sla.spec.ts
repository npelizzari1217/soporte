/**
 * medidores-sla.spec.ts — WU-2 (sdd/sla-primera-respuesta-y-pausa, R9):
 * `MedidorHabil` usa el calendario y los feriados vigentes; `MedidorCorrido`
 * usa tiempo de pared.
 */
import {
  CalcularSlaHabilVenceService,
  CalendarioLaboralSemanal,
} from '../../../calendario-laboral/domain/services/calcular-sla-habil-vence.service';
import { MedidorCorrido } from './medidor-corrido';
import { MedidorHabil } from './medidor-habil';
import { MedidorTiempoSla } from './medidor-tiempo-sla';

const HORA_MS = 3_600_000;

/** L-V 09:00-18:00 local (UTC-3), fin de semana cerrado. */
const CALENDARIO: CalendarioLaboralSemanal = [
  { aperturaMinuto: null, cierreMinuto: null },
  { aperturaMinuto: 540, cierreMinuto: 1080 },
  { aperturaMinuto: 540, cierreMinuto: 1080 },
  { aperturaMinuto: 540, cierreMinuto: 1080 },
  { aperturaMinuto: 540, cierreMinuto: 1080 },
  { aperturaMinuto: 540, cierreMinuto: 1080 },
  { aperturaMinuto: null, cierreMinuto: null },
];

// Viernes 2026-08-07 10:00 local = 13:00Z; lunes 2026-08-10 10:00 local = 13:00Z.
const VIERNES_10 = new Date('2026-08-07T13:00:00.000Z');
const LUNES_10 = new Date('2026-08-10T13:00:00.000Z');

describe('MedidorHabil', () => {
  const servicio = new CalcularSlaHabilVenceService();

  it('entre() mide solo tiempo hábil: viernes 10:00 a lunes 10:00 son 9 h', () => {
    const medidor: MedidorTiempoSla = new MedidorHabil(servicio, CALENDARIO, new Set());

    // Viernes 10:00-18:00 (8 h) + lunes 09:00-10:00 (1 h).
    expect(medidor.entre(VIERNES_10, LUNES_10)).toBe(9 * HORA_MS);
  });

  it('usa los feriados vigentes: con el lunes feriado el rango suma solo el viernes', () => {
    const medidor = new MedidorHabil(servicio, CALENDARIO, new Set(['2026-08-10']));

    expect(medidor.entre(VIERNES_10, LUNES_10)).toBe(8 * HORA_MS);
  });

  it('usa el calendario vigente: con el viernes cerrado el rango suma solo el lunes', () => {
    const viernesCerrado: CalendarioLaboralSemanal = [
      CALENDARIO[0],
      CALENDARIO[1],
      CALENDARIO[2],
      CALENDARIO[3],
      CALENDARIO[4],
      { aperturaMinuto: null, cierreMinuto: null },
      CALENDARIO[6],
    ];
    const medidor = new MedidorHabil(servicio, viernesCerrado, new Set());

    expect(medidor.entre(VIERNES_10, LUNES_10)).toBe(HORA_MS);
  });

  it('sumar() cruza el fin de semana: viernes 10:00 + 9 h hábiles es lunes 10:00', () => {
    const medidor = new MedidorHabil(servicio, CALENDARIO, new Set());

    expect(medidor.sumar(VIERNES_10, 9 * HORA_MS).toISOString()).toBe(LUNES_10.toISOString());
  });
});

describe('MedidorCorrido', () => {
  const medidor: MedidorTiempoSla = new MedidorCorrido();

  it('entre() usa tiempo de pared: 48 h de pared son 48 h', () => {
    const a = new Date('2026-08-07T13:00:00.000Z');
    const b = new Date('2026-08-09T13:00:00.000Z'); // viernes a domingo

    expect(medidor.entre(a, b)).toBe(48 * HORA_MS);
  });

  it('entre() devuelve 0 si b <= a', () => {
    const a = new Date('2026-08-07T13:00:00.000Z');

    expect(medidor.entre(a, a)).toBe(0);
    expect(medidor.entre(a, new Date(a.getTime() - 1))).toBe(0);
  });

  it('sumar() suma tiempo de pared sin calendario: viernes 10:00 + 14 h es sábado 00:00 local', () => {
    expect(medidor.sumar(VIERNES_10, 14 * HORA_MS).toISOString()).toBe('2026-08-08T03:00:00.000Z');
  });
});
