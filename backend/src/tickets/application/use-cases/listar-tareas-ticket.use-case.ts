import { DomainError, Result } from '../../../shared/domain/result';
import { TareaTicketEntity } from '../../domain/entities/tarea-ticket.entity';
import { ITareaTicketRepository } from '../../domain/ports/i-tarea-ticket.repository';
import { ITicketRepository } from '../../domain/ports/i-ticket.repository';
import { AvanceTareas, calcularAvanceTareas } from '../../domain/services/avance-tareas';
import { AlcanceActorTicket, cargarTicketParaOperar } from '../services/visibilidad-ticket';

/** El alcance del actor (`AlcanceActorTicket`) lo carga la capa de interface por request. */
export interface ListarTareasTicketDto extends AlcanceActorTicket {
  ticketId: string;
}

export interface TareasDelTicket {
  /** Tareas activas, por `orden` y fecha de alta. */
  tareas: TareaTicketEntity[];
  avance: AvanceTareas;
}

/**
 * ListarTareasTicketUseCase — tareas activas de un ticket con su avance (odd/tareas-con-tecnico,
 * CA7).
 *
 * Quién lista (odd/permisos-por-tipo-ticket, S3, D5 c): quien ve el ticket, con `LECTURA` sobre su
 * tipo y además `VER_TODOS` sobre ese tipo o la regla de fila (solicitante, responsable o técnico
 * de una tarea activa, CA10). Sin `LECTURA` sobre el tipo no lista nadie, ni el técnico de una de
 * sus tareas. A cualquier otro: 404, sin revelar que el ticket existe.
 */
export class ListarTareasTicketUseCase {
  constructor(
    private readonly ticketRepo: Pick<ITicketRepository, 'findById' | 'esVisiblePara'>,
    private readonly tareaRepo: Pick<ITareaTicketRepository, 'listarPorTicket'>,
  ) {}

  async execute(dto: ListarTareasTicketDto): Promise<Result<TareasDelTicket, DomainError>> {
    const ticketResult = await cargarTicketParaOperar(
      this.ticketRepo,
      dto.ticketId,
      dto,
      'LECTURA',
    );
    if (ticketResult.isFail()) return Result.fail(ticketResult.getError());

    const tareas = await this.tareaRepo.listarPorTicket(ticketResult.getValue().id);
    return Result.ok({ tareas, avance: calcularAvanceTareas(tareas) });
  }
}
