import { DomainError, Result } from '../../../shared/domain/result';
import { TicketEntity } from '../../domain/entities/ticket.entity';
import { ITicketRepository } from '../../domain/ports/i-ticket.repository';

/**
 * ListarTicketsUseCase — caso de uso de consulta para todos los tickets del tenant.
 *
 * Thin wrapper sobre ITicketRepository.findAll(). Retorna todos los tickets
 * no eliminados del tenant activo, ordenados por createdAt desc.
 *
 * La separación de capas impide que el controller importe directamente puertos
 * de dominio.
 *
 * Tarea: feat/tickets-list-mvp
 */
export class ListarTicketsUseCase {
  constructor(private readonly ticketRepo: ITicketRepository) {}

  async execute(): Promise<Result<TicketEntity[], DomainError>> {
    const tickets = await this.ticketRepo.findAll();
    return Result.ok(tickets);
  }
}
