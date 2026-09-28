import { CalendarioLaboralSemanal } from '../services/calcular-sla-habil-vence.service';

/**
 * ICalendarioLaboralSemanalRepository — puerto de lectura del calendario
 * laboral semanal del cliente (`calendario_laboral_dias_cliente`, vive en la
 * base de cada tenant — sdd/horario-laboral-por-cliente).
 *
 * Devuelve exactamente el tipo `CalendarioLaboralSemanal` que
 * `CalcularSlaHabilVenceService` (WU-1) ya espera — este puerto no define
 * tipos propios.
 *
 * Definido en la capa de dominio: sin imports de Prisma ni NestJS.
 */
export interface ICalendarioLaboralSemanalRepository {
  /**
   * Devuelve las 7 ventanas del calendario laboral, indexadas 0 (domingo) a
   * 6 (sábado).
   *
   * @throws Error si la base no tiene las 7 filas — un calendario incompleto
   *               nunca se completa en silencio con un valor por defecto.
   */
  obtener(): Promise<CalendarioLaboralSemanal>;
}

/** Token de inyección de dependencias para ICalendarioLaboralSemanalRepository en NestJS. */
export const CALENDARIO_LABORAL_SEMANAL_REPOSITORY = Symbol(
  'CALENDARIO_LABORAL_SEMANAL_REPOSITORY',
);
