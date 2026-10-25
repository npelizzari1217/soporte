import { AlcanceListadoTickets } from '../../../tickets/domain/ports/i-ticket.repository';

/**
 * Filtro del cumplimiento por técnico del dashboard (odd/tasks/tiempo-tecnico.md, T4, S8).
 * `[desde, hasta)` se aplica a `fin_at` del tramo.
 */
export interface FiltroCumplimientoTecnico {
  desde: Date;
  hasta: Date;
  /** Solo los tramos de este técnico (alcance de TECNICO); `undefined` = todos. */
  tecnicoId?: string;
  /** Solo los tickets que el actor ve, con la misma regla que el listado; `undefined` = todos. */
  alcance?: AlcanceListadoTickets;
}

/** Tramos con veredicto de un técnico en el período, sin el cociente (lo calcula el caso de uso). */
export interface CumplimientoTecnicoCrudo {
  tecnicoId: string;
  /** Tramos cerrados en RESUELTO con `cumplido` no nulo. */
  total: number;
  /** De los anteriores, los que cumplieron la meta. */
  cumplidos: number;
  /** Promedio de `habil_s` de esos tramos, redondeado al segundo. */
  promedioHabilS: number;
}

/**
 * ICumplimientoTecnicoRepository — lectura agregada de `tramos_tecnico_ticket` para el dashboard
 * (odd/tasks/tiempo-tecnico.md, T4, S8). Separado de `ITramoTecnicoRepository`, que es el modelo de
 * escritura de los tramos.
 *
 * Definido en la capa de dominio: sin imports de Prisma ni NestJS.
 */
export interface ICumplimientoTecnicoRepository {
  /**
   * Agrupa por técnico los tramos que cerraron en RESUELTO dentro del período y tienen veredicto
   * (`cumplido` no nulo: los que no tienen meta o medición no se evalúan, S4). Excluye los tramos
   * de tickets dados de baja.
   *
   * @param filtro Período, técnico y alcance.
   * @returns Una fila por técnico, de más a menos tramos evaluados (empate: por id).
   */
  resumirPorTecnico(filtro: FiltroCumplimientoTecnico): Promise<CumplimientoTecnicoCrudo[]>;
}

/** Token de inyección de dependencias para ICumplimientoTecnicoRepository en NestJS. */
export const CUMPLIMIENTO_TECNICO_REPOSITORY = Symbol('CUMPLIMIENTO_TECNICO_REPOSITORY');
