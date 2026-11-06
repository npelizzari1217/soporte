import { modalidadEsEditable } from '../../domain/entities/ticket.entity';
import { IBloqueoTicketRepository } from '../../domain/ports/i-bloqueo-ticket.repository';
import { ITareaTicketRepository } from '../../domain/ports/i-tarea-ticket.repository';

/**
 * Responde si la modalidad de un ticket se puede cambiar HOY (odd/edilicia-obra-externa, S1): sin
 * tareas activas ni compras vinculadas. Es la misma consulta que usa la edición para rechazar el
 * cambio y la que publica el detalle (`modalidadEditable`), así el control de la pantalla no puede
 * divergir de la regla. Cuenta todas las compras vinculadas, también las que el actor no ve.
 */
export class ConsultaModalidadEditable {
  constructor(
    private readonly tareaRepo: Pick<ITareaTicketRepository, 'listarPorTicket'>,
    private readonly bloqueoRepo: Pick<IBloqueoTicketRepository, 'comprasVinculadas'>,
  ) {}

  /**
   * @param ticketId Ticket ya autorizado por el caller.
   * @returns `true` si el ticket no tiene tareas activas ni compras vinculadas.
   */
  async esEditable(ticketId: string): Promise<boolean> {
    const [tareas, compras] = await Promise.all([
      this.tareaRepo.listarPorTicket(ticketId),
      this.bloqueoRepo.comprasVinculadas(ticketId),
    ]);
    const tareasActivas = tareas.filter((tarea) => !tarea.isDeleted()).length;
    return modalidadEsEditable(tareasActivas, compras.length);
  }
}
