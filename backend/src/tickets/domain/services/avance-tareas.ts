/**
 * Avance de las tareas de un ticket de cualquier tipo (odd/tareas-con-tecnico, CA7).
 *
 * Fórmula: completadas activas / total activas, en porcentaje redondeado a 2 decimales. Solo
 * cuentan las tareas activas (`deletedAt === null`), en el numerador y en el denominador. Sin
 * tareas activas el avance es 0.
 *
 * Función pura, sin Prisma ni NestJS. Generaliza el `AvanceCalculator` de reparaciones, que se
 * retiró en T8: el listado de reparaciones y el PDF calculan con esta función.
 */
export interface AvanceTareas {
  /** Tareas activas. */
  total: number;
  /** Tareas activas completadas. */
  completadas: number;
  /** `completadas * 100 / total`, en [0, 100] con 2 decimales; 0 si no hay tareas activas. */
  porcentaje: number;
}

export function calcularAvanceTareas(
  tareas: ReadonlyArray<{ completada: boolean; deletedAt: Date | null }>,
): AvanceTareas {
  const activas = tareas.filter((t) => t.deletedAt === null);
  const completadas = activas.filter((t) => t.completada).length;
  if (activas.length === 0) return { total: 0, completadas: 0, porcentaje: 0 };
  const porcentaje = (completadas * 100.0) / activas.length;
  return {
    total: activas.length,
    completadas,
    porcentaje: Math.round(porcentaje * 100) / 100,
  };
}
