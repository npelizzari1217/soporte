/**
 * Regla de UI para editar una reparación (odd/detalle-ticket-legible, S5-S6), espejo de
 * `EditarReparacionUseCase`: se edita si el ticket está NUEVO o ASIGNADO y ninguna tarea está
 * completada; fuera de eso, solo ROOT. Una reparación bloqueada por una compra no la edita nadie. En
 * RESUELTO, CERRADO o CANCELADO quien no es administrador solo comenta (odd/cerrado-solo-comentarios).
 * El backend sigue siendo la autoridad: acá solo se decide si el botón se habilita y qué motivo mostrar.
 */
import { motivoSoloComentarios } from "@/features/tickets/lib/solo-comentarios";

/** Estados anteriores a EN_PROCESO, mismos que `ESTADOS_PRE_PROCESO` del backend. */
const ESTADOS_NO_EMPEZADA: ReadonlySet<string> = new Set(["NUEVO", "ASIGNADO"]);

export type MotivoNoEditable = "BLOQUEADA" | "SOLO_COMENTARIOS" | "EN_PROCESO" | "TAREAS_COMPLETADAS";

/** Textos de los motivos que no dependen del estado; el de `SOLO_COMENTARIOS` lo nombra. */
export const MENSAJES_NO_EDITABLE: Readonly<Record<Exclude<MotivoNoEditable, "SOLO_COMENTARIOS">, string>> = {
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
 * @param esRoot `true` para ROOT, que salta las reglas de estado pero no el bloqueo.
 * @param esAdministrador `true` para ADMINISTRADOR y ROOT: no quedan en solo comentarios (S3).
 * @returns `{ puede: true }` o el motivo por el que no.
 */
export function puedeEditarReparacionUi(
  reparacion: ReparacionParaEditar,
  estadoCodigo: string | undefined,
  esRoot: boolean,
  esAdministrador: boolean,
): { puede: true } | { puede: false; motivo: MotivoNoEditable } {
  if (reparacion.bloqueada) return { puede: false, motivo: "BLOQUEADA" };
  if (esRoot) return { puede: true };
  if (motivoSoloComentarios(estadoCodigo, esAdministrador) !== null) {
    return { puede: false, motivo: "SOLO_COMENTARIOS" };
  }
  if (estadoCodigo !== undefined && !ESTADOS_NO_EMPEZADA.has(estadoCodigo)) {
    return { puede: false, motivo: "EN_PROCESO" };
  }
  if (reparacion.subtareas.some((t) => t.completada)) {
    return { puede: false, motivo: "TAREAS_COMPLETADAS" };
  }
  return { puede: true };
}

/**
 * Texto para mostrar de un motivo.
 *
 * @param motivo Motivo de `puedeEditarReparacionUi`.
 * @param estadoCodigo Código del estado del ticket: `SOLO_COMENTARIOS` lo nombra.
 * @returns El texto del motivo.
 */
export function textoMotivoNoEditable(motivo: MotivoNoEditable, estadoCodigo: string | undefined): string {
  if (motivo === "SOLO_COMENTARIOS") {
    // `SOLO_COMENTARIOS` sale de un estado ya resuelto, así que el texto siempre existe.
    return motivoSoloComentarios(estadoCodigo, false) ?? "El ticket solo admite comentarios.";
  }
  return MENSAJES_NO_EDITABLE[motivo];
}
