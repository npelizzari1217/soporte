import { PESO_TAREAS_MAX } from '../entities/tarea-ticket.entity';

/**
 * Suma de los pesos de las tareas activas de un ticket si `tareaId` pasara a pesar `pesoNuevo`
 * (odd/edilicia-obra-externa, S9). Las tareas dadas de baja no cuentan.
 *
 * @param tareas Tareas del ticket, leídas con el lock del ticket tomado.
 * @param tareaId Tarea cuyo peso cambia.
 * @param pesoNuevo Peso pedido para esa tarea.
 * @returns La suma resultante, en porcentaje entero.
 */
export function sumaDePesosConCambio(
  tareas: ReadonlyArray<{ id: string; peso: number; deletedAt: Date | null }>,
  tareaId: string,
  pesoNuevo: number,
): number {
  return tareas
    .filter((tarea) => tarea.deletedAt === null)
    .reduce((suma, tarea) => suma + (tarea.id === tareaId ? pesoNuevo : tarea.peso), 0);
}

/** `true` si la suma no supera el tope (S9: nunca por encima de 100). */
export function sumaDePesosAdmitida(suma: number): boolean {
  return suma <= PESO_TAREAS_MAX;
}
