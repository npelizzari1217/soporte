import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { TIPO_OPERACION_TAREA } from '../../domain/constants/tipos-operacion-tarea.constants';
import { IOperacionTicketRepository } from '../../domain/ports/i-operacion-ticket.repository';
import { ITareaTicketRepository } from '../../domain/ports/i-tarea-ticket.repository';
import { ITipoOperacionRepository } from '../../domain/ports/i-tipo-operacion.repository';
import { ITipoTicketRepository } from '../../domain/ports/i-tipo-ticket.repository';
import {
  ActorTarea,
  autorizarGestion,
  cargarTareaDelTicket,
  mapearErrorDeTarea,
  operacionDeTarea,
  resolverTipoOperacion,
  TicketRepoDeTareas,
} from '../services/tareas-ticket.reglas';

export interface EliminarTareaDto {
  ticketId: string;
  tareaId: string;
  actor: ActorTarea;
}

/**
 * EliminarTareaUseCase — baja lógica de una tarea (odd/tareas-con-tecnico, CA3). La fila queda,
 * con quién la completó si lo estaba, y deja de contar para el avance. La baja queda en el
 * historial (`TAREA_ELIMINADA`), igual que la baja de una subtarea edilicia escribía
 * `AVANCE_EDILICIO`, en la misma transacción que la tarea.
 */
export class EliminarTareaUseCase {
  constructor(
    private readonly ticketRepo: TicketRepoDeTareas,
    private readonly tipoTicketRepo: Pick<ITipoTicketRepository, 'findById'>,
    private readonly tareaRepo: Pick<ITareaTicketRepository, 'buscarPorId' | 'guardar'>,
    private readonly operacionRepo: Pick<IOperacionTicketRepository, 'save'>,
    private readonly tipoOperacionRepo: Pick<ITipoOperacionRepository, 'findIdByCodigo'>,
    private readonly txRunner: Pick<ITenantTransactionRunner, 'run'>,
    private readonly ahora: () => Date = () => new Date(),
  ) {}

  async execute(dto: EliminarTareaDto): Promise<Result<void, DomainError>> {
    const gestion = await autorizarGestion(
      { ticketRepo: this.ticketRepo, tipoTicketRepo: this.tipoTicketRepo },
      dto.ticketId,
      dto.actor,
      'borrar',
    );
    if (gestion.isFail()) return Result.fail(gestion.getError());

    const tareaResult = await cargarTareaDelTicket(this.tareaRepo, dto.ticketId, dto.tareaId);
    if (tareaResult.isFail()) return Result.fail(tareaResult.getError());
    const tarea = tareaResult.getValue();

    const baja = tarea.eliminar(this.ahora());
    if (baja.isFail()) return Result.fail(mapearErrorDeTarea(baja.getError(), tarea.id));

    const tipoOperacionId = await resolverTipoOperacion(
      this.tipoOperacionRepo,
      TIPO_OPERACION_TAREA.ELIMINADA,
    );
    const operacion = operacionDeTarea({ tarea, tipoOperacionId, autorId: dto.actor.id });

    await this.txRunner.run(async () => {
      await this.tareaRepo.guardar(tarea);
      await this.operacionRepo.save(operacion);
    });

    return Result.ok(undefined);
  }
}
