/**
 * Regla de UI para editar una reparación (odd/detalle-ticket-legible, S5-S6), espejo de
 * `EditarReparacionUseCase`: se edita si el ticket está NUEVO o ASIGNADO y ninguna tarea está
 * completada; fuera de eso, solo ROOT. Una reparación bloqueada por una compra no la edita nadie.
 * El backend sigue siendo la autoridad: acá solo se decide si el botón se habilita y qué motivo mostrar.
 */

/** Estados anteriores a EN_PROCESO, mismos que `ESTADOS_PRE_PROCESO` del backend. */
const ESTADOS_NO_EMPEZADA: ReadonlySet<string> = new Set(["NUEVO", "ASIGNADO"]);

export type MotivoNoEditable = "BLOQUEADA" | "EN_PROCESO" | "TAREAS_COMPLETADAS";

export const MENSAJES_NO_EDITABLE: Readonly<Record<MotivoNoEditable, string>> = {
  BLOQUEADA: "Bloqueada por una compra en curso: no se puede editar.",
  EN_PROCESO: "Ya está en proceso: solo ROOT puede editarla.",
  TAREAS_COMPLETADAS: "Ya tiene tareas completadas: solo ROOT puede editarla.",
};

export interface ReparacionParaEditar {
  bloqueada: boolean;
  subtareas: ReadonlyArray<{ completada: boolean }>;
}

/**
 * Decide si la reparación se puede editar y, si no, por qué.
 *
 * @param reparacion Fila del listado: bloqueo y tareas activas.
 * @param estadoCodigo Código del estado del ticket; `undefined` mientras el catálogo no resolvió
 *   (no se bloquea por eso: decide el backend).
 * @param esRoot `true` para ROOT, que salta la regla de "no empezada" pero no el bloqueo.
 * @returns `{ puede: true }` o el motivo por el que no.
 */
export function puedeEditarReparacionUi(
  reparacion: ReparacionParaEditar,
  estadoCodigo: string | undefined,
  esRoot: boolean,
): { puede: true } | { puede: false; motivo: MotivoNoEditable } {
  if (reparacion.bloqueada) return { puede: false, motivo: "BLOQUEADA" };
  if (esRoot) return { puede: true };
  if (estadoCodigo !== undefined && !ESTADOS_NO_EMPEZADA.has(estadoCodigo)) {
    return { puede: false, motivo: "EN_PROCESO" };
  }
  if (reparacion.subtareas.some((t) => t.completada)) {
    return { puede: false, motivo: "TAREAS_COMPLETADAS" };
  }
  return { puede: true };
}
