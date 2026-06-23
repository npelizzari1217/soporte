/**
 * AvanceCalculator — función pura para calcular el porcentaje de avance edilicio.
 *
 * Implementa la fórmula del spec:
 *
 * ```sql
 * ROUND(
 *   (COUNT(*) FILTER (WHERE completada = TRUE AND deleted_at IS NULL) * 100.0)
 *   / NULLIF(COUNT(*) FILTER (WHERE deleted_at IS NULL), 0),
 *   2
 * )
 * ```
 *
 * Casos especiales:
 * - Sin subtareas activas (denominador = 0): retorna 0.00 (NULLIF protección).
 * - Todas completadas: retorna 100.00 exacto.
 * - Resultado siempre en el rango [0.00, 100.00] con 2 decimales.
 *
 * Sin estado interno, sin efectos secundarios, sin imports de Prisma ni NestJS.
 * Testeable en unidad sin ningún mock.
 *
 * Ref spec: [SPEC:reparaciones/Fórmula de porcentaje de avance]
 * Tarea: 5.A.2
 */
export class AvanceCalculator {
  /**
   * Calcula el porcentaje de avance dado el número de subtareas completadas
   * y el total de subtareas activas.
   *
   * Implementa NULLIF: si totalActivas = 0, retorna 0 (sin división por cero).
   *
   * @param completadasActivas Número de subtareas con completada=TRUE y deleted_at IS NULL.
   * @param totalActivas       Número total de subtareas con deleted_at IS NULL.
   * @returns Porcentaje de avance en [0, 100] redondeado a 2 decimales.
   */
  static calcular(completadasActivas: number, totalActivas: number): number {
    // NULLIF: si el denominador es 0, retorna 0 (protección contra división por cero)
    if (totalActivas === 0) return 0;
    const porcentaje = (completadasActivas * 100.0) / totalActivas;
    return Math.round(porcentaje * 100) / 100;
  }

  /**
   * Variante de conveniencia que acepta directamente la lista de subtareas.
   *
   * Filtra las subtareas soft-deleted (deletedAt !== null) antes de calcular.
   * Solo las subtareas activas (deletedAt = null) participan en el cálculo,
   * tanto en el numerador (completadas activas) como en el denominador (activas).
   *
   * @param subtareas Lista de subtareas con sus campos relevantes.
   * @returns Porcentaje de avance en [0, 100] redondeado a 2 decimales.
   */
  static calcularDesdeSubtareas(
    subtareas: ReadonlyArray<{ completada: boolean; deletedAt: Date | null }>,
  ): number {
    const activas = subtareas.filter((s) => s.deletedAt === null);
    const completadasActivas = activas.filter((s) => s.completada).length;
    return AvanceCalculator.calcular(completadasActivas, activas.length);
  }
}
