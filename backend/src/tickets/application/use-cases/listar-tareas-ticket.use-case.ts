import { DomainError, Result } from '../../../shared/domain/result';
import { TareaTicketEntity } from '../../domain/entities/tarea-ticket.entity';
import { TicketNoEncontradoError } from '../../domain/errors/tickets.errors';
import { ITareaTicketRepository } from '../../domain/ports/i-tarea-ticket.repository';
import { ITicketRepository } from '../../domain/ports/i-ticket.repository';
import { AvanceTareas, calcularAvanceTareas } from '../../domain/services/avance-tareas';
import { cargarTicket } from '../services/tareas-ticket.reglas';
import { esTicketVisiblePara } from '../services/visibilidad-ticket';

export interface ListarTareasTicketDto {
  ticketId: string;
  actorId: string;
  /** `puedeEjecutar(user, 'TICKETS:VER_TODOS')`, igual que en `ObtenerTicketUseCase`. */
  tienePermisoVerTodos: boolean;
}

export interface TareasDelTicket {
  /** Tareas activas, por `orden` y fecha de alta. */
  tareas: TareaTicketEntity[];
  avance: AvanceTareas;
}

/**
 * ListarTareasTicketUseCase — tareas activas de un ticket con su avance (odd/tareas-con-tecnico,
 * CA7). Las ve quien ve el ticket (`esTicketVisiblePara`, la regla de `ObtenerTicketUseCase`); a
 * cualquier otro el ticket le da 404, sin revelar que existe.
 */
export class ListarTareasTicketUseCase {
  constructor(
    private readonly ticketRepo: Pick<ITicketRepository, 'findById' | 'esVisiblePara'>,
    private readonly tareaRepo: Pick<ITareaTicketRepository, 'listarPorTicket'>,
  ) {}

  async execute(dto: ListarTareasTicketDto): Promise<Result<TareasDelTicket, DomainError>> {
    const ticketResult = await cargarTicket(this.ticketRepo, dto.ticketId);
    if (ticketResult.isFail()) return Result.fail(ticketResult.getError());
    const ticket = ticketResult.getValue();
    if (
      !(await esTicketVisiblePara(this.ticketRepo, ticket, dto.actorId, dto.tienePermisoVerTodos))
    ) {
      return Result.fail(new TicketNoEncontradoError(dto.ticketId));
    }

    const tareas = await this.tareaRepo.listarPorTicket(ticket.id);
    return Result.ok({ tareas, avance: calcularAvanceTareas(tareas) });
  }
}
