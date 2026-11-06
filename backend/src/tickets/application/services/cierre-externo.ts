import { ICertificadoAvanceRepository } from '../../domain/ports/i-certificado-avance.repository';
import { ITareaTicketRepository } from '../../domain/ports/i-tarea-ticket.repository';

/**
 * Cuántas tareas activas de un ticket no están en un certificado vigente
 * (odd/edilicia-obra-externa, S10): un ticket EXTERNA no se cierra mientras quede alguna. Corre
 * dentro de la transacción de la transición, con el lock del ticket tomado; emitir y anular toman
 * el mismo lock.
 */
export class ConsultaCierreExterno {
  constructor(
    private readonly tareaRepo: Pick<ITareaTicketRepository, 'listarPorTicket'>,
    private readonly certificadoRepo: Pick<ICertificadoAvanceRepository, 'tareasCertificadas'>,
  ) {}

  /**
   * @param ticketId Ticket bloqueado por la transacción en curso.
   * @returns La cantidad de tareas activas sin certificado vigente.
   */
  async tareasSinCertificar(ticketId: string): Promise<number> {
    const [tareas, certificadas] = await Promise.all([
      this.tareaRepo.listarPorTicket(ticketId),
      this.certificadoRepo.tareasCertificadas(ticketId),
    ]);
    return tareas.filter((tarea) => !tarea.isDeleted() && !certificadas.has(tarea.id)).length;
  }
}
