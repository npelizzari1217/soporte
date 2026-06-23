import { OperacionTicketEntity } from '../../domain/entities/operacion-ticket.entity';
import { IOperacionTicketRepository } from '../../domain/ports/i-operacion-ticket.repository';

/**
 * ListarOperacionesUseCase — caso de uso de consulta para el timeline de un ticket.
 *
 * Thin wrapper sobre IOperacionTicketRepository.findByTicketId(). Mantiene la
 * separación de capas: la presentación importa solo use cases, no puertos de dominio.
 *
 * Retorna lista vacía si el ticketId no tiene operaciones asociadas.
 * El orden es cronológico ASC (definido por el repositorio).
 *
 * Ref spec: [SPEC:tickets-core/Tabla operaciones_ticket]
 * Tarea: 3.E.2
 */
export class ListarOperacionesUseCase {
  constructor(private readonly operacionRepo: IOperacionTicketRepository) {}

  async execute(ticketId: string): Promise<OperacionTicketEntity[]> {
    return this.operacionRepo.findByTicketId(ticketId);
  }
}
