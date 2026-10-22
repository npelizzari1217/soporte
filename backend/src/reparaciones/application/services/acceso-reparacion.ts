import { DomainError, Result } from '../../../shared/domain/result';
import { TicketEntity } from '../../../tickets/domain/entities/ticket.entity';
import { TicketNoEncontradoError } from '../../../tickets/domain/errors/tickets.errors';
import { ITicketRepository } from '../../../tickets/domain/ports/i-ticket.repository';
import {
  AlcanceActorTicket,
  puedeOperarTicket,
  RequisitoDeAccion,
} from '../../../tickets/application/services/visibilidad-ticket';
import { TicketEdiliciaEntity } from '../../domain/entities/ticket-edilicia.entity';
import { TicketEdiliciaNoEncontradoError } from '../../domain/errors/reparaciones.errors';
import { ITicketEdiliciaRepository } from '../../domain/ports/i-ticket-edilicia.repository';

/**
 * `puedeOperarTicket` sobre el ticket base de una reparación (odd/permisos-por-tipo-ticket, D5 c).
 * Un ticket que el actor no ve responde como una reparación inexistente
 * (`TicketEdiliciaNoEncontradoError` con el id de la reparación): el 404 no nombra el ticket base.
 * Si lo ve y le falta la acción, el 403 de `puedeOperarTicket`.
 *
 * @param ticketRepo Repositorio de tickets, para la regla de fila.
 * @param ticket Ticket base ya leído.
 * @param reparacionId Id de la reparación pedida.
 * @param alcance Alcance del actor.
 * @param requisitos Acciones que exige la operación sobre el tipo del ticket base.
 * @returns Ok, o el 404 o el 403 que corresponde.
 */
export async function puedeOperarReparacion(
  ticketRepo: Pick<ITicketRepository, 'esVisiblePara'>,
  ticket: TicketEntity,
  reparacionId: string,
  alcance: AlcanceActorTicket,
  ...requisitos: RequisitoDeAccion[]
): Promise<Result<void, DomainError>> {
  const acceso = await puedeOperarTicket(ticketRepo, ticket, alcance, ...requisitos);
  if (acceso.isOk()) return acceso;
  const error = acceso.getError();
  return Result.fail(
    error instanceof TicketNoEncontradoError
      ? new TicketEdiliciaNoEncontradoError(reparacionId)
      : error,
  );
}

/**
 * Carga una reparación activa y su ticket base, y aplica `puedeOperarReparacion`. Una reparación
 * inexistente o dada de baja es `TicketEdiliciaNoEncontradoError`; un ticket base inexistente o dado
 * de baja, `TicketNoEncontradoError` (como antes de los permisos por tipo).
 *
 * @param ediliciaRepo Repositorio de reparaciones.
 * @param ticketRepo Repositorio de tickets.
 * @param reparacionId Id de la reparación (`ticket_edilicia`).
 * @param alcance Alcance del actor.
 * @param requisitos Acciones que exige la operación sobre el tipo del ticket base.
 * @returns La reparación y su ticket base, o el error que corresponde.
 */
export async function cargarReparacionParaOperar(
  ediliciaRepo: Pick<ITicketEdiliciaRepository, 'findById'>,
  ticketRepo: Pick<ITicketRepository, 'findById' | 'esVisiblePara'>,
  reparacionId: string,
  alcance: AlcanceActorTicket,
  ...requisitos: RequisitoDeAccion[]
): Promise<Result<{ reparacion: TicketEdiliciaEntity; ticket: TicketEntity }, DomainError>> {
  const reparacion = await ediliciaRepo.findById(reparacionId);
  if (!reparacion || reparacion.isDeleted()) {
    return Result.fail(new TicketEdiliciaNoEncontradoError(reparacionId));
  }
  const ticket = await ticketRepo.findById(reparacion.ticketId);
  if (!ticket || ticket.isDeleted()) {
    return Result.fail(new TicketNoEncontradoError(reparacion.ticketId));
  }
  const acceso = await puedeOperarReparacion(
    ticketRepo,
    ticket,
    reparacionId,
    alcance,
    ...requisitos,
  );
  return acceso.isFail() ? Result.fail(acceso.getError()) : Result.ok({ reparacion, ticket });
}
