import { TicketEntity } from '../../domain/entities/ticket.entity';

/**
 * Regla de visibilidad de un ticket (T6): con `TICKETS:VER_TODOS` el actor ve cualquier ticket
 * del inquilino; sin el permiso, solo los que solicitó. La comparten `ObtenerTicketUseCase` y los
 * casos de uso de tareas, para que ver las tareas de un ticket pida lo mismo que ver el ticket.
 */
export function esTicketVisiblePara(
  ticket: TicketEntity,
  actorId: string,
  tienePermisoVerTodos: boolean,
): boolean {
  return tienePermisoVerTodos || ticket.solicitanteId === actorId;
}
