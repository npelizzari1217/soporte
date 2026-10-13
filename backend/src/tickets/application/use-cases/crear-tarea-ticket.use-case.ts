import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { TareaTicketEntity } from '../../domain/entities/tarea-ticket.entity';
import { TIPO_OPERACION_TAREA } from '../../domain/constants/tipos-operacion-tarea.constants';
import { IOperacionTicketRepository } from '../../domain/ports/i-operacion-ticket.repository';
import { ITareaTicketRepository } from '../../domain/ports/i-tarea-ticket.repository';
import { ITicketRepository } from '../../domain/ports/i-ticket.repository';
import { ITipoOperacionRepository } from '../../domain/ports/i-tipo-operacion.repository';
import { ITipoTicketRepository } from '../../domain/ports/i-tipo-ticket.repository';
import {
  ActorTarea,
  autorizarGestion,
  operacionDeTarea,
  resolverTipoOperacion,
} from '../services/tareas-ticket.reglas';

export interface CrearTareaTicketDto {
  ticketId: string;
  actor: ActorTarea;
  /** Ya validada en el borde (no vacía, hasta 255 caracteres). */
  descripcion: string;
}

/**
 * CrearTareaTicketUseCase — alta de una tarea pendiente y sin técnico (odd/tareas-con-tecnico,
 * CA1, CA3). La tarea va después de la última activa (`max(orden) + 1`, o 0 si no hay ninguna).
 * El alta queda en el historial (`TAREA_CREADA`), igual que el alta de una subtarea edilicia
 * escribía `AVANCE_EDILICIO`, en la misma transacción que la tarea.
 */
export class CrearTareaTicketUseCase {
  constructor(
    private readonly ticketRepo: Pick<ITicketRepository, 'findById'>,
    private readonly tipoTicketRepo: Pick<ITipoTicketRepository, 'findById'>,
    private readonly tareaRepo: Pick<ITareaTicketRepository, 'listarPorTicket' | 'crear'>,
    private readonly operacionRepo: Pick<IOperacionTicketRepository, 'save'>,
    private readonly tipoOperacionRepo: Pick<ITipoOperacionRepository, 'findIdByCodigo'>,
    private readonly txRunner: Pick<ITenantTransactionRunner, 'run'>,
  ) {}

  async execute(dto: CrearTareaTicketDto): Promise<Result<TareaTicketEntity, DomainError>> {
    const gestion = await autorizarGestion(
      { ticketRepo: this.ticketRepo, tipoTicketRepo: this.tipoTicketRepo },
      dto.ticketId,
      dto.actor,
      'crear',
    );
    if (gestion.isFail()) return Result.fail(gestion.getError());
    const { ticket } = gestion.getValue();

    const activas = await this.tareaRepo.listarPorTicket(ticket.id);
    const orden = activas.length === 0 ? 0 : Math.max(...activas.map((t) => t.orden)) + 1;
    const tarea = TareaTicketEntity.crear({
      ticketId: ticket.id,
      descripcion: dto.descripcion,
      orden,
    });

    const tipoOperacionId = await resolverTipoOperacion(
      this.tipoOperacionRepo,
      TIPO_OPERACION_TAREA.CREADA,
    );
    const operacion = operacionDeTarea({ tarea, tipoOperacionId, autorId: dto.actor.id });

    await this.txRunner.run(async () => {
      await this.tareaRepo.crear(tarea);
      await this.operacionRepo.save(operacion);
    });

    return Result.ok(tarea);
  }
}
