import { FeriadosLaborales } from '../services/calcular-sla-habil-vence.service';

/**
 * IFeriadosLaboralesRepository — puerto de lectura de los feriados de día
 * completo que aplican al tenant en curso: la unión de los globales
 * (`feriados`, en MASTER) y los propios del cliente (`feriados_cliente`, en
 * la base del tenant). Nunca incluye feriados de otro cliente.
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
