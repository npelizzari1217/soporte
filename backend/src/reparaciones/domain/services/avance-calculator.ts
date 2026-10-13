import { calcularAvanceTareas } from '../../../tickets/domain/services/avance-tareas';

/**
 * AvanceCalculator — función pura para calcular el porcentaje de avance
 * edilicio a partir de las subtareas de un `ticket_edilicia` (F3-E3, F3-E4).
 *
 * Fórmula: `ROUND((completadasActivas * 100.0) / totalActivas, 2)`.
 * Solo cuentan las subtareas ACTIVAS (`deletedAt === null`), tanto en el
 * numerador (completadas activas) como en el denominador (total activas).
 * Sin subtareas activas (denominador = 0) → retorna 0 (protección contra
 * división por cero).
 *
 * Sin estado interno, sin efectos secundarios, sin imports de Prisma ni
 * NestJS — dominio puro, testeable en unidad sin ningún mock.
 *
 * Desde odd/tareas-con-tecnico (T2) la fórmula vive en `calcularAvanceTareas`
 * (`tickets/domain/services/avance-tareas.ts`), que sirve para cualquier
 * ticket; este método delega para no cambiar a sus llamadores todavía.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-E3, F3-E4. Ref design:
 * "Firmas TS clave" (AvanceCalculator). Tarea: T6.1, T6.2.
 */
export class AvanceCalculator {
  /**
   * Calcula el porcentaje de avance a partir de la lista completa de
   * subtareas (incluyendo soft-deleted, que se filtran internamente).
   *
   * @param subtareas Lista de subtareas con `completada` y `deletedAt`.
   * @returns Porcentaje de avance en [0, 100] redondeado a 2 decimales.
   */
  static calcularDesdeSubtareas(
    subtareas: ReadonlyArray<{ completada: boolean; deletedAt: Date | null }>,
  ): number {
    return calcularAvanceTareas(subtareas).porcentaje;
  }
}
