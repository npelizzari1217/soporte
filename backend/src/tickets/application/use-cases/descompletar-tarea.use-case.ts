import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { TareaTicketEntity } from '../../domain/entities/tarea-ticket.entity';
import { TIPO_OPERACION_TAREA } from '../../domain/constants/tipos-operacion-tarea.constants';
import { IOperacionTicketRepository } from '../../domain/ports/i-operacion-ticket.repository';
import { ITareaTicketRepository } from '../../domain/ports/i-tarea-ticket.repository';
import { ITicketRepository } from '../../domain/ports/i-ticket.repository';
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
} from '../services/tareas-ticket.reglas';

export interface DescompletarTareaDto {
  ticketId: string;
  tareaId: string;
  actor: ActorTarea;
}

/**
 * DescompletarTareaUseCase — vuelve una tarea a pendiente y limpia quién y cuándo la completó
 * (odd/tareas-con-tecnico, CA4, CA8). Lo pueden hacer las mismas personas que completan.
 *
 * Una tarea pendiente da `TareaNoCompletadaError` (409). Escribe `TAREA_DESCOMPLETADA`, con quién
 * la había completado, en la misma transacción que la tarea.
 */
export class DescompletarTareaUseCase {
  constructor(
    private readonly ticketRepo: Pick<ITicketRepository, 'findById'>,
    private readonly tareaRepo: Pick<ITareaTicketRepository, 'buscarPorId' | 'guardar'>,
    private readonly operacionRepo: Pick<IOperacionTicketRepository, 'save'>,
    private readonly tipoOperacionRepo: Pick<ITipoOperacionRepository, 'findIdByCodigo'>,
    private readonly txRunner: Pick<ITenantTransactionRunner, 'run'>,
    private readonly ahora: () => Date = () => new Date(),
  ) {}

  async execute(dto: DescompletarTareaDto): Promise<Result<TareaTicketEntity, DomainError>> {
    const ticketResult = await cargarTicket(this.ticketRepo, dto.ticketId);
    if (ticketResult.isFail()) return Result.fail(ticketResult.getError());
    const ticket = ticketResult.getValue();

    const tareaResult = await cargarTareaDelTicket(this.tareaRepo, ticket.id, dto.tareaId);
    if (tareaResult.isFail()) return Result.fail(tareaResult.getError());
    const tarea = tareaResult.getValue();

    if (!puedeCompletarTarea(dto.actor, ticket, tarea)) {
      return Result.fail(rechazar(ticket, dto.actor, 'descompletar'));
    }

    const completadaPorAnteriorId = tarea.completadaPorId;
    const cambio = tarea.descompletar(this.ahora());
    if (cambio.isFail()) return Result.fail(mapearErrorDeTarea(cambio.getError(), tarea.id));

    const tipoOperacionId = await resolverTipoOperacion(
      this.tipoOperacionRepo,
      TIPO_OPERACION_TAREA.DESCOMPLETADA,
    );
    const operacion = operacionDeTarea({
      tarea,
      tipoOperacionId,
      autorId: dto.actor.id,
      metadata: { completada_por_anterior_id: completadaPorAnteriorId },
    });

    await this.txRunner.run(async () => {
      await this.tareaRepo.guardar(tarea);
      await this.operacionRepo.save(operacion);
    });

    return Result.ok(tarea);
  }
}
