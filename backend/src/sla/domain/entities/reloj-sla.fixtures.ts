/**
 * Fixtures compartidos de los specs de `RelojSla` (sdd/sla-primera-respuesta-y-pausa, WU-3b).
 * Calendario L-V 09:00-18:00 local (UTC-3), fin de semana cerrado.
 * Agosto 2026: lunes = 10, martes = 11, miércoles = 12, viernes = 7.
 */
import {
  CalcularSlaHabilVenceService,
  CalendarioLaboralSemanal,
} from '../../../calendario-laboral/domain/services/calcular-sla-habil-vence.service';
import { RelojSla, RelojSlaFila, TransicionReloj } from './reloj-sla';

export const H = 3600;
export const abierto = { aperturaMinuto: 540, cierreMinuto: 1080 };
export const cerrado = { aperturaMinuto: null, cierreMinuto: null };
const CALENDARIO: CalendarioLaboralSemanal = [
  cerrado,
  abierto,
  abierto,
  abierto,
  abierto,
  abierto,
  cerrado,
];
export const calculo = new CalcularSlaHabilVenceService();

/** Instante local (UTC-3) de un día de agosto de 2026. */
export const L = (dia: number, hora: number, min = 0): Date =>
  new Date(Date.UTC(2026, 7, dia, hora + 3, min));

export const habil = (calendario = CALENDARIO) =>
  RelojSla.medidorPara('HABIL', calculo, calendario, new Set());
export const corrido = () => RelojSla.medidorPara('CORRIDO', calculo, CALENDARIO, new Set());

export const fila = (over: Partial<RelojSlaFila> = {}): RelojSlaFila => ({
  ticketId: 't1',
  estadoCodigo: 'EN_PROCESO',
  slaRegla: 'HABIL',
  createdAt: L(10, 9),
  slaVenceAt: null,
  acumuladoS: 0,
  metaS: 8 * H,
  correDesde: L(10, 9),
  seqHasta: 0,
  version: 1,
  cumplido: null,
  ...over,
});

export const op = (anterior: string | null, nuevo: string, createdAt: Date): TransicionReloj => ({
  estadoAnteriorCodigo: anterior,
  estadoNuevoCodigo: nuevo,
  createdAt,
});
