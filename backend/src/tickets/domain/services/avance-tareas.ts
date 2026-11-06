import type { ModalidadTicket } from '../entities/ticket.entity';

/**
 * Avance de las tareas de un ticket de cualquier tipo (odd/tareas-con-tecnico, CA7).
 *
 * Fórmula (INTERNA): completadas activas / total activas, en porcentaje redondeado a 2 decimales. Solo
 * cuentan las tareas activas (`deletedAt === null`), en el numerador y en el denominador. Sin
 * tareas activas el avance es 0.
 *
 * Fórmula (EXTERNA, odd/edilicia-obra-externa S3): suma de los pesos de las tareas activas
 * completadas. Es un entero en [0, 100], porque la suma de los pesos nunca supera 100.
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

/**
 * @param tareas Tareas del ticket; las dadas de baja no cuentan.
 * @param modalidad Modalidad del ticket. En `EXTERNA` el avance físico es la suma de los pesos de
 *   las tareas completadas (odd/edilicia-obra-externa, S3, S4); en `INTERNA`, la fórmula de siempre.
 * @returns Total, completadas y porcentaje con 2 decimales.
 */
export function calcularAvanceTareas(
  tareas: ReadonlyArray<{ completada: boolean; deletedAt: Date | null; peso: number }>,
  modalidad: ModalidadTicket = 'INTERNA',
): AvanceTareas {
  const activas = tareas.filter((t) => t.deletedAt === null);
  const completadas = activas.filter((t) => t.completada);
  if (activas.length === 0) return { total: 0, completadas: 0, porcentaje: 0 };
  if (modalidad === 'EXTERNA') {
    const porcentaje = completadas.reduce((suma, t) => suma + t.peso, 0);
    return { total: activas.length, completadas: completadas.length, porcentaje };
  }
  const porcentaje = (completadas.length * 100.0) / activas.length;
  return {
    total: activas.length,
    completadas: completadas.length,
    porcentaje: Math.round(porcentaje * 100) / 100,
  };
}
