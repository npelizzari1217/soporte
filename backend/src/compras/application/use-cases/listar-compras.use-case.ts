import { DomainError, Result } from '../../../shared/domain/result';
import { TicketEntity } from '../../../tickets/domain/entities/ticket.entity';
import { TicketCompraEntity } from '../../domain/entities/ticket-compra.entity';
import { ITicketCompraRepository } from '../../domain/ports/i-ticket-compra.repository';
import { ITicketRepository } from '../../../tickets/domain/ports/i-ticket.repository';

/**
 * ListarComprasUseCase — caso de uso de consulta para todos los tickets de compra.
 *
 * Obtiene todos los TicketCompraEntity del tenant y para cada uno resuelve
 * el ticket base vía ITicketRepository.findById(ticketId). Retorna pares
 * {ticket, ticketCompra} listos para que el controller los mapee a DTO.
 *
 * Los satélites sin ticket base asociado (registros huérfanos) se omiten
 * silenciosamente.
 *
 * Tarea: feat/tickets-list-mvp
 */
export interface CompraConTicket {
  ticket: TicketEntity;
  ticketCompra: TicketCompraEntity;
}

export class ListarComprasUseCase {
  constructor(
    private readonly ticketCompraRepo: ITicketCompraRepository,
    private readonly ticketRepo: ITicketRepository,
  ) {}

  async execute(): Promise<Result<CompraConTicket[], DomainError>> {
    const compras = await this.ticketCompraRepo.findAll();
    const items: CompraConTicket[] = [];

    for (const ticketCompra of compras) {
      const ticket = await this.ticketRepo.findById(ticketCompra.ticketId);
      if (ticket) {
        items.push({ ticket, ticketCompra });
      }
    }

    return Result.ok(items);
  }
}
