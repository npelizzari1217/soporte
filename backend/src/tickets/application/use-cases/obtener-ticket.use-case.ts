import { DomainError, Result } from '../../../shared/domain/result';
import { TicketEntity } from '../../domain/entities/ticket.entity';
import { TicketNoEncontradoError } from '../../domain/errors/tickets.errors';
import { ITicketRepository } from '../../domain/ports/i-ticket.repository';

/**
 * ObtenerTicketUseCase — caso de uso de consulta para un único ticket por ID.
 *
 * Thin wrapper sobre ITicketRepository.findById(). Su propósito es mantener
 * la separación de capas: la capa de presentación (controller) no importa
 * directamente puertos de dominio — solo use cases de la capa de aplicación.
 *
 * Retorna Result.fail(TicketNoEncontradoError) si el ticket no existe.
 *
 * Ref spec: [SPEC:tickets-core/Tabla tickets]
 * Tarea: 3.E.2
 */
export class ObtenerTicketUseCase {
  constructor(private readonly ticketRepo: ITicketRepository) {}

  async execute(id: string): Promise<Result<TicketEntity, DomainError>> {
    const ticket = await this.ticketRepo.findById(id);
    // WARNING-1 fix: findById también devuelve tickets soft-deleted; el caller
    // debe tratarlos como no encontrados para que GET /tickets/:id dé 404.
    if (!ticket || ticket.isDeleted()) {
      return Result.fail(new TicketNoEncontradoError(id));
    }
    return Result.ok(ticket);
  }
}
