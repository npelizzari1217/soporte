import { DomainError, Result } from '../../../shared/domain/result';
import { TicketNoEncontradoError } from '../../../tickets/domain/errors/tickets.errors';
import { TicketEdiliciaNoEncontradoError } from '../../domain/errors/reparaciones.errors';

/**
 * Traduce el 404 del ticket al de la reparación pedida (odd/ticket-unificado): el `:reparacionId`
 * de las rutas `/reparaciones/...` es el id del ticket, el que devuelve el listado, y su 404 nombra
 * la reparación, nunca el ticket base. Un id que no es de un ticket (como el del satélite
 * `ticket_edilicia` que devolvía el listado viejo) no se traduce: es un ticket inexistente.
 *
 * @param reparacionId El id tal como llegó en la ruta.
 * @param resultado El resultado del caso de uso que operó sobre ese ticket.
 * @returns El mismo resultado, con su `TicketNoEncontradoError` como `TicketEdiliciaNoEncontradoError`.
 */
export function comoReparacion<T>(
  reparacionId: string,
  resultado: Result<T, DomainError>,
): Result<T, DomainError> {
  if (resultado.isOk()) return resultado;
  const error = resultado.getError();
  return error instanceof TicketNoEncontradoError
    ? Result.fail(new TicketEdiliciaNoEncontradoError(reparacionId))
    : resultado;
}
