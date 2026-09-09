import { FeriadosLaborales } from '../services/calcular-sla-habil-vence.service';

/**
 * IFeriadosLaboralesRepository — puerto de lectura de los feriados de día
 * completo (`feriados`, vive en MASTER).
 *
 * Devuelve exactamente el tipo `FeriadosLaborales` que
 * `CalcularSlaHabilVenceService` (WU-1) ya espera — este puerto no define
 * tipos propios.
 *
 * Definido en la capa de dominio: sin imports de Prisma ni NestJS.
 */
export interface IFeriadosLaboralesRepository {
  /**
   * Devuelve todos los feriados vigentes, como claves de día LOCAL
   * `'YYYY-MM-DD'` (no `Date`) — ver el docstring de `FeriadosLaborales`.
   */
  obtener(): Promise<FeriadosLaborales>;
}

/** Token de inyección de dependencias para IFeriadosLaboralesRepository en NestJS. */
export const FERIADOS_LABORALES_REPOSITORY = Symbol('FERIADOS_LABORALES_REPOSITORY');
