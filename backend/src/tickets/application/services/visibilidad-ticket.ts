import { TicketEntity } from '../../domain/entities/ticket.entity';
import { ITicketRepository } from '../../domain/ports/i-ticket.repository';

/**
 * Regla de visibilidad de un ticket (T6, extendida por odd/tareas-con-tecnico CA10): con
 * `TICKETS:VER_TODOS` el actor ve cualquier ticket del inquilino; sin el permiso, los que solicitó,
 * los que tiene asignados como responsable (decisión del dueño del 2026-10-14) y aquellos donde es
 * el técnico de una tarea activa. Al quitarlo de la tarea, o al borrarla, deja de verlo, salvo que
 * lo vea por otro de esos motivos.
 *
 * La comparten `ObtenerTicketUseCase`, `ListarTimelineUseCase` y los casos de uso de tareas, para
 * que ver el historial o las tareas pida lo mismo que ver el ticket. El listado aplica la misma
 * regla en SQL con el filtro `visiblePara` (`ITicketRepository.esVisiblePara` comparte esa
 * definición). Solo decide qué se ve: lo que el actor puede modificar no cambia.
 */
export async function esTicketVisiblePara(
  ticketRepo: Pick<ITicketRepository, 'esVisiblePara'>,
  ticket: TicketEntity,
  actorId: string,
  tienePermisoVerTodos: boolean,
): Promise<boolean> {
  if (tienePermisoVerTodos || ticket.solicitanteId === actorId || ticket.asignadoId === actorId) {
    return true;
  }
  return ticketRepo.esVisiblePara(ticket.id, actorId);
}
