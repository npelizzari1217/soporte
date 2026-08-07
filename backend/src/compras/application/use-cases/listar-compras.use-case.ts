import { DomainError, Result } from '../../../shared/domain/result';
import { TicketEntity } from '../../../tickets/domain/entities/ticket.entity';
import { ITicketRepository } from '../../../tickets/domain/ports/i-ticket.repository';
import { TicketCompraEntity } from '../../domain/entities/ticket-compra.entity';
import { ITicketCompraRepository } from '../../domain/ports/i-ticket-compra.repository';

/** Un ticket de compra resuelto junto a su ticket base (para listados). */
export interface CompraConTicket {
  ticket: TicketEntity;
  ticketCompra: TicketCompraEntity;
}

/**
 * ListarComprasUseCase — caso de uso de consulta para los tickets de
 * compra del tenant.
 *
 * Obtiene todos los `TicketCompraEntity` activos y resuelve el `Ticket`
 * base de cada uno (join en memoria — `ticket_compra` no guarda
 * número/título propios). Satélites sin ticket base asociado (registros
 * huérfanos, no debería pasar en producción) se omiten silenciosamente.
 *
 * Tarea: T4.5.
 */
export class ListarComprasUseCase {
  constructor(
    private readonly ticketCompraRepo: Pick<ITicketCompraRepository, 'findAll'>,
    private readonly ticketRepo: Pick<ITicketRepository, 'findById'>,
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
