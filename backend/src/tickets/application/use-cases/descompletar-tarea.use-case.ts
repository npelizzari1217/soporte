import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { TareaTicketEntity } from '../../domain/entities/tarea-ticket.entity';
import { TIPO_OPERACION_TAREA } from '../../domain/constants/tipos-operacion-tarea.constants';
import { TareaNoCompletadaError, TareaYaCompletadaError } from '../../domain/errors/tareas.errors';
import { CondicionDeDescompletado } from '../../domain/ports/i-tarea-ticket.repository';
import { IOperacionTicketRepository } from '../../domain/ports/i-operacion-ticket.repository';
import { ITareaTicketRepository } from '../../domain/ports/i-tarea-ticket.repository';
import { ITipoOperacionRepository } from '../../domain/ports/i-tipo-operacion.repository';
import { VerificadorTicketEditable } from '../services/ticket-editable-para-tareas';
import {
  ActorTarea,
  cargarTareaDelTicket,
  cargarTicket,
  condicionDeTecnico,
  errorDeCompletadoRechazado,
  errorDeEscrituraRechazada,
  mapearErrorDeTarea,
  operacionDeTarea,
  puedeCompletarTarea,
  rechazar,
  resolverTipoOperacion,
  TicketRepoDeTareas,
} from '../services/tareas-ticket.reglas';
import { AvanzarEstadoPorTareasService } from '../services/avanzar-estado-por-tareas.service';

export interface DescompletarTareaDto {
  ticketId: string;
  tareaId: string;
  actor: ActorTarea;
}

/**
 * DescompletarTareaUseCase — vuelve una tarea a pendiente y limpia quién y cuándo la completó
 * (odd/tareas-con-tecnico, CA4, CA8). Lo pueden hacer las mismas personas que completan.
 *
 * Una tarea pendiente da `TareaNoCompletadaError` (409). La escritura exige que la tarea siga activa
 * y completada (T10): si otra acción la descompletó o la borró después de cargarla, no escribe nada
 * y da el 409 o el 404 del estado actual. Escribe `TAREA_DESCOMPLETADA`, con quién la había
 * completado, en la misma transacción, solo si la tarea se escribió.
 *
 * La escritura exige además el completado que se leyó (T13, JD-S1): si en el medio alguien la
 * descompletó y otro la volvió a completar, no borra esa completación nueva y da
 * `TareaYaCompletadaError` (409). Si el actor puede solo por ser el técnico de la tarea, exige
 * también que siga siéndolo (JD-S2): una reasignación en el medio da el rechazo de permiso.
 *
 * El estado del ticket sigue a sus tareas (odd/estado-por-tareas, S4-S6): en la misma transacción,
 * con la fila del ticket bloqueada ANTES de escribir la tarea, `AvanzarEstadoPorTareasService`
 * devuelve un ticket RESUELTO a EN_PROCESO.
 */
export class DescompletarTareaUseCase {
  constructor(
    private readonly ticketRepo: TicketRepoDeTareas,
    private readonly tareaRepo: Pick<
      ITareaTicketRepository,
      'buscarPorId' | 'descompletarSiCompletada'
    >,
    private readonly operacionRepo: Pick<IOperacionTicketRepository, 'save'>,
    private readonly tipoOperacionRepo: Pick<ITipoOperacionRepository, 'findIdByCodigo'>,
    private readonly txRunner: Pick<ITenantTransactionRunner, 'run'>,
    private readonly avanzarEstado: Pick<AvanzarEstadoPorTareasService, 'aplicar'>,
    private readonly verificadorEditable: Pick<VerificadorTicketEditable, 'verificar'>,
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
      return Result.fail(await rechazar(this.ticketRepo, ticket, dto.actor, 'descompletar'));
    }
    const editable = await this.verificadorEditable.verificar(ticket);
    if (editable.isFail()) return Result.fail(editable.getError());

    const completadaPorAnteriorId = tarea.completadaPorId;
    const completadaEnLeida = tarea.completadaEn;
    const condicion: CondicionDeDescompletado = {
      ...condicionDeTecnico(dto.actor, ticket, tarea),
      ...(completadaPorAnteriorId !== null &&
        completadaEnLeida !== null && {
          completadoLeido: {
            completadaPorId: completadaPorAnteriorId,
            completadaEn: completadaEnLeida,
          },
        }),
    };
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

    const escrita = await this.txRunner.run(async () => {
      await this.ticketRepo.bloquear(ticket.id);
      if (!(await this.tareaRepo.descompletarSiCompletada(tarea, condicion))) return false;
      await this.operacionRepo.save(operacion);
      await this.avanzarEstado.aplicar('DESCOMPLETAR', ticket.id, dto.actor.id);
      return true;
    });
    if (!escrita) {
      return Result.fail(
        await errorDeEscrituraRechazada(
          this.tareaRepo,
          tarea.id,
          errorDeCompletadoRechazado(
            this.ticketRepo,
            ticket,
            dto.actor,
            'descompletar',
            // Completada otra vez por un completado que el actor no vio (JD-S1): el 409 dice el
            // estado real, que la tarea está completada, y el frontend refresca la lista.
            (actual) =>
              actual.completada
                ? new TareaYaCompletadaError(tarea.id)
                : new TareaNoCompletadaError(tarea.id),
          ),
        ),
      );
    }

    return Result.ok(tarea);
  }
}
