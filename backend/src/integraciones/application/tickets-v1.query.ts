import { DomainError, Result } from '../../shared/domain/result';
import {
  TicketNoEncontradoError,
  TicketReferenciaInvalidaError,
} from '../../tickets/domain/errors/tickets.errors';
import { ITicketRepository } from '../../tickets/domain/ports/i-ticket.repository';
import { ITipoTicketRepository } from '../../tickets/domain/ports/i-tipo-ticket.repository';
import { MODULO_API_V1 } from './tipos-ticket-v1.query';

/**
 * TicketsV1Query — que tickets existen para la API `v1` (CA1): los del tenant de la clave cuyo
 * tipo es del modulo TICKETS, el mismo gate que aplica el listado (`modulosPermitidos`). Un tipo
 * dado de baja del modulo sigue contando, igual que en el listado (`findIdsByModulos`).
 *
 * Un ticket de otro modulo responde igual que uno inexistente: v1 no revela que existe.
 */
export class TicketsV1Query {
  constructor(
    private readonly tickets: Pick<ITicketRepository, 'findById'>,
    private readonly tipos: Pick<ITipoTicketRepository, 'findIdsByModulos'>,
  ) {}

  /** Ok si el ticket es de v1; si no, el mismo `TicketNoEncontradoError` que uno inexistente. */
  async validarExistente(ticketId: string): Promise<Result<void, DomainError>> {
    return (await this.esDeV1(ticketId))
      ? Result.ok(undefined)
      : Result.fail(new TicketNoEncontradoError(ticketId));
  }

  /** Ok si la referencia es un ticket de v1; si no, el mismo 422 que una referencia inexistente. */
  async validarReferencia(ticketReferenciaId: string): Promise<Result<void, DomainError>> {
    return (await this.esDeV1(ticketReferenciaId))
      ? Result.ok(undefined)
      : Result.fail(new TicketReferenciaInvalidaError(ticketReferenciaId));
  }

  private async esDeV1(ticketId: string): Promise<boolean> {
    const ticket = await this.tickets.findById(ticketId);
    if (!ticket || ticket.isDeleted()) return false;
    const tiposV1 = await this.tipos.findIdsByModulos([MODULO_API_V1]);
    return tiposV1.includes(ticket.tipoId);
  }
}
