import { DomainError, Result } from '../../../shared/domain/result';
import { EstadoEntity } from '../../domain/entities/estado.entity';
import { TicketEntity } from '../../domain/entities/ticket.entity';
import { TicketSoloComentariosError } from '../../domain/errors/tickets.errors';
import { IEstadoRepository } from '../../domain/ports/i-estado.repository';
import { ticketSoloComentarios } from '../../domain/policies/solo-comentarios.policy';
import { AlcanceActorTicket } from './visibilidad-ticket';

/**
 * Aplicación de la regla `ticketSoloComentarios` (odd/cerrado-solo-comentarios) en los casos de uso
 * que escriben sobre un ticket existente. Corre DESPUÉS de la autorización del actor: un 404/403
 * sigue mandando antes que el 422.
 */

/**
 * ¿El alcance es el de un ADMINISTRADOR o ROOT? `CargadorAlcanceTicket` les da
 * `permisosPorTipo: null` (sin restricción) y a nadie más: la API pública arma siempre un mapa.
 *
 * @param alcance Alcance del actor.
 * @returns `true` para ADMINISTRADOR y ROOT.
 */
export function esAlcanceDeAdministrador(
  alcance: Pick<AlcanceActorTicket, 'permisosPorTipo'>,
): boolean {
  return alcance.permisosPorTipo === null;
}

/**
 * Exige que el actor pueda modificar un ticket en este estado.
 *
 * @param estadoCodigo Código del estado actual del ticket.
 * @param actorEsAdministrador `true` para ADMINISTRADOR y ROOT, exentos (S3).
 * @returns Ok, o `TicketSoloComentariosError` (422) en RESUELTO, CERRADO o CANCELADO.
 */
export function exigirModificableEnEstado(
  estadoCodigo: string,
  actorEsAdministrador: boolean,
): Result<void, DomainError> {
  if (ticketSoloComentarios(estadoCodigo, actorEsAdministrador)) {
    return Result.fail(new TicketSoloComentariosError(estadoCodigo));
  }
  return Result.ok(undefined);
}

/**
 * Resuelve el estado actual del ticket y aplica `exigirModificableEnEstado`.
 *
 * @param estadoRepo Catálogo de estados del tenant.
 * @param ticket Ticket ya cargado (y autorizado).
 * @param actorEsAdministrador `true` para ADMINISTRADOR y ROOT.
 * @returns El estado actual, para que el caso de uso no lo vuelva a leer, o el 422.
 * @throws Error si el catálogo no tiene el estado del ticket: es un fallo de infraestructura, no
 *   del caller (mismo throw defensivo que el resto de los casos de uso).
 */
export async function verificarTicketModificable(
  estadoRepo: Pick<IEstadoRepository, 'findById'>,
  ticket: TicketEntity,
  actorEsAdministrador: boolean,
): Promise<Result<EstadoEntity, DomainError>> {
  const estado = await estadoRepo.findById(ticket.estadoId);
  if (!estado) {
    throw new Error(
      `Catálogo de estados inconsistente: no existe el estado con id "${ticket.estadoId}" en el tenant activo.`,
    );
  }
  const modificable = exigirModificableEnEstado(estado.codigo, actorEsAdministrador);
  return modificable.isFail() ? Result.fail(modificable.getError()) : Result.ok(estado);
}
