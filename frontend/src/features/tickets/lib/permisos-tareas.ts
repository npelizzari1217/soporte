/**
 * Quién ve cada botón de las tareas de un ticket (odd/tareas-con-tecnico, T6).
 * Espeja `puedeGestionarTareas` y `puedeCompletarTarea` de
 * `backend/src/tickets/application/services/tareas-ticket.reglas.ts` (CA3, CA4).
 *
 * Es solo experiencia: el backend decide, y un 403 suyo llega como toast.
 *
 * `asignadoId: undefined` significa "responsable desconocido": el diálogo de
 * Edilicia no siempre puede leer el ticket (`GET /tickets/:id` exige
 * `TICKETS:LECTURA`). En ese caso se muestra el botón a quien podría ser el
 * responsable —quien tiene el permiso del módulo— y el backend corta al resto.
 */

export interface ActorTareasUi {
  /** `sub` del JWT. */
  id: string;
  /** ROOT o ADMINISTRADOR del cliente activo (`useSession().esAdminCliente`). */
  esAdministrador: boolean;
  /** `<MODULO>:MODIFICACION` del módulo del tipo del ticket. */
  tieneModificacionDelModulo: boolean;
}

/** CA3: crear, asignar y borrar — responsable, ADMINISTRADOR o ROOT, con el permiso del módulo. */
export function puedeGestionarTareasUi(actor: ActorTareasUi, asignadoId: string | null | undefined): boolean {
  const puedeSerResponsable = asignadoId === undefined || asignadoId === actor.id;
  return (actor.esAdministrador || puedeSerResponsable) && actor.tieneModificacionDelModulo;
}

/** CA4: completar y descompletar — técnico de la tarea, responsable, ADMINISTRADOR o ROOT. */
export function puedeCompletarTareaUi(
  actor: ActorTareasUi,
  asignadoId: string | null | undefined,
  tecnicoId: string | null,
): boolean {
  if (actor.esAdministrador) return true;
  if (tecnicoId !== null && tecnicoId === actor.id) return true;
  if (asignadoId === undefined) return actor.tieneModificacionDelModulo;
  return asignadoId !== null && asignadoId === actor.id;
}

/**
 * Por qué las tareas (y los comentarios de reparación) del ticket son de solo lectura
 * (odd/ticket-cerrado-solo-lectura, S4). Espeja `VerificadorTicketEditable` del backend:
 * CERRADO, CANCELADO o reparación bloqueada por una compra activa. RESUELTO no bloquea.
 *
 * `estadoCodigo: undefined` es "catálogo todavía no resuelto": no se esconde nada y decide el
 * backend. `bloqueada` solo lo conoce el listado de Edilicia; el detalle del ticket pasa `false`.
 *
 * @returns El motivo para mostrar, o `null` si se puede editar.
 */
export function motivoTareasSoloLectura(estadoCodigo: string | undefined, bloqueada: boolean): string | null {
  if (estadoCodigo === "CERRADO") return "El ticket está cerrado: sus tareas y comentarios ya no se modifican.";
  if (estadoCodigo === "CANCELADO") return "El ticket está cancelado: sus tareas y comentarios ya no se modifican.";
  if (bloqueada) {
    return "La reparación está bloqueada por una compra en curso: sus tareas y comentarios ya no se modifican.";
  }
  return null;
}
