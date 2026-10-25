import { ApiError } from "@/shared/api/types";

/**
 * Texto del alert inline cuando falla un guardado de horario laboral, del
 * tenant o de un técnico. Mismo criterio de normalización que `notifyError`:
 * el mensaje de dominio del backend, o un genérico que no filtra detalles
 * internos.
 *
 * @param error Lo que rechazó la mutación.
 * @returns El mensaje para mostrar al usuario.
 */
export function mensajeErrorGuardado(error: unknown): string {
  if (error instanceof ApiError) return error.messages.join(" ");
  return "No se pudo guardar el horario laboral. Intente de nuevo.";
}
