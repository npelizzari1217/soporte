import { DomainError, Result } from '../../shared/domain/result';
import { ITicketRepository } from '../../tickets/domain/ports/i-ticket.repository';
import {
  AlcanceActorTicket,
  cargarTicketParaOperar,
} from '../../tickets/application/services/visibilidad-ticket';
import { ITramoTecnicoRepository, TramoTecnico } from '../domain/ports/i-tramo-tecnico.repository';

/**
 * DTO de entrada de `ListarTramosTicketUseCase`. El alcance del actor lo carga la capa de
 * interface por request, igual que en el detalle del ticket.
 */
export interface ListarTramosTicketDto extends AlcanceActorTicket {
  ticketId: string;
}

/**
 * ListarTramosTicketUseCase — tramos del técnico de un ticket, para su detalle
 * (odd/tasks/tiempo-tecnico.md, T4, S8).
 *
 * Los ve exactamente quien ve el ticket: la misma carga que `ObtenerTicketUseCase`
 * (`cargarTicketParaOperar` con `LECTURA`), así que un ticket inexistente, borrado o que el actor
 * no ve es `TicketNoEncontradoError` (404) y no se leen sus tramos.
 */
export class ListarTramosTicketUseCase {
  constructor(
    private readonly ticketRepo: Pick<ITicketRepository, 'findById' | 'esVisiblePara'>,
    private readonly tramoRepo: Pick<ITramoTecnicoRepository, 'listarPorTicket'>,
  ) {}

  /**
   * @param dto Ticket y alcance del actor.
   * @returns Los tramos del más viejo al más nuevo, o el error de visibilidad del ticket.
   */
  async execute(dto: ListarTramosTicketDto): Promise<Result<TramoTecnico[], DomainError>> {
    const ticket = await cargarTicketParaOperar(this.ticketRepo, dto.ticketId, dto, 'LECTURA');
    if (ticket.isFail()) return Result.fail(ticket.getError());
    return Result.ok(await this.tramoRepo.listarPorTicket(dto.ticketId));
  }
}
