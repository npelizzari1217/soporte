import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { TareaTicketEntity } from '../../domain/entities/tarea-ticket.entity';
import { TIPO_OPERACION_TAREA } from '../../domain/constants/tipos-operacion-tarea.constants';
import { TareaYaCompletadaError } from '../../domain/errors/tareas.errors';
import { IOperacionTicketRepository } from '../../domain/ports/i-operacion-ticket.repository';
import { ITareaTicketRepository } from '../../domain/ports/i-tarea-ticket.repository';
import { ITipoOperacionRepository } from '../../domain/ports/i-tipo-operacion.repository';
import {
  ActorTarea,
  cargarTareaDelTicket,
  cargarTicket,
  errorDeEscrituraRechazada,
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
 * crédito. La escritura exige que la tarea siga activa y pendiente (T10): si otra acción la
 * completó o la borró después de cargarla, no escribe nada y da el 409 o el 404 del estado
 * actual. Escribe `TAREA_COMPLETADA` en la misma transacción, solo si la tarea se escribió.
 */
export class CompletarTareaUseCase {
  constructor(
    private readonly ticketRepo: TicketRepoDeTareas,
    private readonly tareaRepo: Pick<
      ITareaTicketRepository,
      'buscarPorId' | 'completarSiPendiente'
    >,
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

    const escrita = await this.txRunner.run(async () => {
      if (!(await this.tareaRepo.completarSiPendiente(tarea))) return false;
      await this.operacionRepo.save(operacion);
      return true;
    });
    if (!escrita) {
      return Result.fail(
        await errorDeEscrituraRechazada(
          this.tareaRepo,
          tarea.id,
          new TareaYaCompletadaError(tarea.id),
        ),
      );
    }

    return Result.ok(tarea);
  }
}
