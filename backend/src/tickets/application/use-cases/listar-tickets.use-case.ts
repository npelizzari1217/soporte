import { DomainError, Result } from '../../../shared/domain/result';
import { TicketEntity } from '../../domain/entities/ticket.entity';
import { ITicketRepository, TicketFiltros } from '../../domain/ports/i-ticket.repository';

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

  /**
   * Lista los tickets del tenant aplicando los filtros opcionales.
   *
   * @param filtros - Filtros opcionales (tiposIds, fechaDesde, fechaHasta).
   *   El use case permanece PURO: no consulta ciclos ni impone defaults.
   *   La lógica de "default = ciclo activo" es responsabilidad del frontend (PR4).
   */
  async execute(filtros?: TicketFiltros): Promise<Result<TicketEntity[], DomainError>> {
    const tickets = await this.ticketRepo.findAll(filtros);
    return Result.ok(tickets);
  }
}
