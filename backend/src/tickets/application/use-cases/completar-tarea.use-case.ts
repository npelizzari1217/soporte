import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { TareaTicketEntity } from '../../domain/entities/tarea-ticket.entity';
import { TIPO_OPERACION_TAREA } from '../../domain/constants/tipos-operacion-tarea.constants';
import { IOperacionTicketRepository } from '../../domain/ports/i-operacion-ticket.repository';
import { ITareaTicketRepository } from '../../domain/ports/i-tarea-ticket.repository';
import { ITipoOperacionRepository } from '../../domain/ports/i-tipo-operacion.repository';
import {
  ActorTarea,
  cargarTareaDelTicket,
  cargarTicket,
  mapearErrorDeTarea,
  operacionDeTarea,
  puedeCompletarTarea,
  rechazar,
  resolverTipoOperacion,
  TicketRepoDeTareas,
} from '../services/tareas-ticket.reglas';

export interface CompletarTareaDto {
  ticketId: string;
  tareaId: string;
  actor: ActorTarea;
}

/**
 * CompletarTareaUseCase — marca una tarea como completada por el actor (odd/tareas-con-tecnico, CA4,
 * CA8). El crédito es de quien completa: `completadaPorId` es el actor, no el técnico asignado.
 *
 * Una tarea ya completada da `TareaYaCompletadaError` (409): quien la completó primero conserva el
 * crédito. Escribe `TAREA_COMPLETADA` en la misma transacción que la tarea.
 */
export class CompletarTareaUseCase {
  constructor(
    private readonly ticketRepo: TicketRepoDeTareas,
    private readonly tareaRepo: Pick<ITareaTicketRepository, 'buscarPorId' | 'guardar'>,
    private readonly operacionRepo: Pick<IOperacionTicketRepository, 'save'>,
    private readonly tipoOperacionRepo: Pick<ITipoOperacionRepository, 'findIdByCodigo'>,
    private readonly txRunner: Pick<ITenantTransactionRunner, 'run'>,
    private readonly ahora: () => Date = () => new Date(),
  ) {}

  async execute(dto: CompletarTareaDto): Promise<Result<TareaTicketEntity, DomainError>> {
    const ticketResult = await cargarTicket(this.ticketRepo, dto.ticketId);
    if (ticketResult.isFail()) return Result.fail(ticketResult.getError());
    const ticket = ticketResult.getValue();

    const tareaResult = await cargarTareaDelTicket(this.tareaRepo, ticket.id, dto.tareaId);
    if (tareaResult.isFail()) return Result.fail(tareaResult.getError());
    const tarea = tareaResult.getValue();

    if (!puedeCompletarTarea(dto.actor, ticket, tarea)) {
      return Result.fail(await rechazar(this.ticketRepo, ticket, dto.actor, 'completar'));
    }

    const cambio = tarea.completar(dto.actor.id, this.ahora());
    if (cambio.isFail()) return Result.fail(mapearErrorDeTarea(cambio.getError(), tarea.id));

    const tipoOperacionId = await resolverTipoOperacion(
      this.tipoOperacionRepo,
      TIPO_OPERACION_TAREA.COMPLETADA,
    );
    const operacion = operacionDeTarea({
      tarea,
      tipoOperacionId,
      autorId: dto.actor.id,
    });

    await this.txRunner.run(async () => {
      await this.tareaRepo.guardar(tarea);
      await this.operacionRepo.save(operacion);
    });

    return Result.ok(tarea);
  }
}
