import { motivoSoloComentarios } from "./solo-comentarios";

/**
 * Quién ve cada botón de las tareas de un ticket (odd/tareas-con-tecnico, T6).
 * Espeja `puedeGestionarTareas` y `puedeCompletarTarea` de
 * `backend/src/tickets/application/services/tareas-ticket.reglas.ts` (CA3, CA4).
 *
 * Es solo experiencia: el backend decide, y un 403 suyo llega como toast.
 *
 * `asignadoId: undefined` significa "responsable desconocido": el diálogo de
 * Edilicia no siempre puede leer el ticket (`GET /tickets/:id` puede fallar o
 * estar cargando). En ese caso se muestra el botón a quien podría ser el
 * responsable —quien tiene `MODIFICACION` sobre el tipo— y el backend corta al
 * resto.
 */

export interface ActorTareasUi {
  /** `sub` del JWT. */
  id: string;
  /** ROOT o ADMINISTRADOR del cliente activo (`useSession().esAdminCliente`). */
  esAdministrador: boolean;
  /** `MODIFICACION` sobre el tipo del ticket (odd/permisos-por-tipo-ticket, D5 c). */
  tieneModificacionDelTipo: boolean;
}

/** CA3: crear, asignar y borrar — responsable, ADMINISTRADOR o ROOT, con `MODIFICACION` sobre el tipo. */
export function puedeGestionarTareasUi(actor: ActorTareasUi, asignadoId: string | null | undefined): boolean {
  const puedeSerResponsable = asignadoId === undefined || asignadoId === actor.id;
  return (actor.esAdministrador || puedeSerResponsable) && actor.tieneModificacionDelTipo;
}

/** CA4: completar y descompletar — técnico de la tarea, responsable, ADMINISTRADOR o ROOT. */
export function puedeCompletarTareaUi(
  actor: ActorTareasUi,
  asignadoId: string | null | undefined,
  tecnicoId: string | null,
): boolean {
  if (actor.esAdministrador) return true;
  if (tecnicoId !== null && tecnicoId === actor.id) return true;
  if (asignadoId === undefined) return actor.tieneModificacionDelTipo;
  return asignadoId !== null && asignadoId === actor.id;
}

/**
 * Por qué las tareas del ticket son de solo lectura. Espeja `VerificadorTicketEditable` del backend:
 * - RESUELTO, CERRADO o CANCELADO, para quien no es ADMINISTRADOR ni ROOT (odd/cerrado-solo-comentarios,
 *   `motivoSoloComentarios`). Los administradores quedan exentos: pueden corregir y reabrir.
 * - Un ticket de cualquier tipo bloqueado por una compra activa, para cualquiera
 *   (odd/ticket-unificado, S5).
 *
 * `estadoCodigo: undefined` es "catálogo todavía no resuelto": no se esconde nada por el estado y
 * decide el backend. `bloqueada` sale de la fila de Edilicia o, en el detalle del ticket, de sus
 * compras vinculadas con `COMPRAS:LECTURA` y, sin esa celda, de `bloqueada` en `GET /tickets/:id`.
 * Los comentarios no dependen de esto: se aceptan en cualquier estado.
 *
 * @param estadoCodigo Código del estado del ticket, o `undefined`.
 * @param bloqueada `true` si una compra activa lo bloquea.
 * @param esAdministrador `true` para ADMINISTRADOR y ROOT (`useSession().esAdminCliente`).
 * @returns El motivo para mostrar, o `null` si se puede editar.
 */
export function motivoTareasSoloLectura(
  estadoCodigo: string | undefined,
  bloqueada: boolean,
  esAdministrador: boolean,
): string | null {
  const soloComentarios = motivoSoloComentarios(estadoCodigo, esAdministrador);
  if (soloComentarios !== null) return soloComentarios;
  if (bloqueada) {
    return "El ticket está bloqueado por una compra en curso: sus tareas ya no se modifican.";
  }
  return null;
}
