import { DomainError, Result } from '../../../shared/domain/result';
import { TicketNoEncontradoError } from '../../../tickets/domain/errors/tickets.errors';
import { TicketEdiliciaNoEncontradoError } from '../../domain/errors/reparaciones.errors';
import { ITicketEdiliciaRepository } from '../../domain/ports/i-ticket-edilicia.repository';

/**
 * Traduce el `:reparacionId` de las rutas `/reparaciones/...` al ticket sobre el que se opera
 * (odd/ticket-unificado). Desde S1 las compras, la ubicación y los comentarios son del ticket, y
 * el listado de Edilicia devuelve ids de ticket; las rutas viejas siguen aceptando también el id
 * del satélite `ticket_edilicia`, el que el frontend recibía antes, hasta que T3 las deje de usar.
 *
 * Errores: un satélite dado de baja, o cualquier ticket que no exista o que el actor no vea, es
 * `TicketEdiliciaNoEncontradoError` con el id pedido: el 404 de una ruta de reparaciones nombra la
 * reparación, nunca el ticket base.
 */
export class ResolutorReparacion {
  constructor(private readonly ediliciaRepo: Pick<ITicketEdiliciaRepository, 'findById'>) {}

  /**
   * Resuelve el ticket de `reparacionId` y corre `operar` sobre él.
   *
   * @param reparacionId Id del satélite o del ticket, tal como llegó en la ruta.
   * @param operar La operación sobre el ticket, normalmente un caso de uso por id de ticket.
   * @returns El resultado de `operar`, con su `TicketNoEncontradoError` traducido a la reparación.
   */
  async sobreTicket<T>(
    reparacionId: string,
    operar: (ticketId: string) => Promise<Result<T, DomainError>>,
  ): Promise<Result<T, DomainError>> {
    const ticketId = await this.ticketIdDe(reparacionId);
    if (ticketId === null) return Result.fail(new TicketEdiliciaNoEncontradoError(reparacionId));
    const resultado = await operar(ticketId);
    if (resultado.isOk()) return resultado;
    const error = resultado.getError();
    return Result.fail(
      error instanceof TicketNoEncontradoError
        ? new TicketEdiliciaNoEncontradoError(reparacionId)
        : error,
    );
  }

  /**
   * El ticket del satélite si `reparacionId` es uno; si no, el mismo id, como id de ticket. `null`
   * si es un satélite dado de baja.
   */
  private async ticketIdDe(reparacionId: string): Promise<string | null> {
    const satelite = await this.ediliciaRepo.findById(reparacionId);
    if (satelite === null) return reparacionId;
    return satelite.isDeleted() ? null : satelite.ticketId;
  }
}
