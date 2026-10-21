import { TicketEntity } from '../../domain/entities/ticket.entity';
import { ITicketRepository } from '../../domain/ports/i-ticket.repository';
import { ITipoTicketRepository } from '../../domain/ports/i-tipo-ticket.repository';

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

/**
 * Lo que el actor puede ver de los tickets, tal como lo arma el controller desde el JWT.
 * `modulosPermitidos` en `null` es "sin restricción de módulo" (ROOT y ADMINISTRADOR), el mismo
 * criterio que aplica el listado (`ListarTicketsUseCase`).
 */
export interface AlcanceActorTicket {
  actorId: string;
  tienePermisoVerTodos: boolean;
  modulosPermitidos: readonly string[] | null;
}

/** Repositorios que necesita `esTicketAccesiblePara`. */
export interface RepositoriosDeAcceso {
  ticketRepo: Pick<ITicketRepository, 'esVisiblePara'>;
  tipoTicketRepo: Pick<ITipoTicketRepository, 'findById'>;
}

/**
 * Punto único de lectura de un ticket existente (odd/permisos-por-tipo-ticket, S0, D2): el módulo
 * del tipo del ticket tiene que estar entre los del actor, y además rige `esTicketVisiblePara`.
 * Es el mismo criterio que el listado, que filtra por `findIdsByModulos`. Sin esto, un ticket que
 * el listado oculta se veía igual por id. Un tipo inexistente se trata como no accesible.
 *
 * @returns `true` si el actor puede ver el ticket.
 */
export async function esTicketAccesiblePara(
  repos: RepositoriosDeAcceso,
  ticket: TicketEntity,
  alcance: AlcanceActorTicket,
): Promise<boolean> {
  if (alcance.modulosPermitidos !== null) {
    const tipo = await repos.tipoTicketRepo.findById(ticket.tipoId);
    if (!tipo || !alcance.modulosPermitidos.includes(tipo.modulo)) return false;
  }
  return esTicketVisiblePara(
    repos.ticketRepo,
    ticket,
    alcance.actorId,
    alcance.tienePermisoVerTodos,
  );
}
