import { DomainError, Result } from '../../../shared/domain/result';
import { ITenantTransactionRunner } from '../../../shared/infrastructure/persistence/tenant-transaction-runner';
import { TareaTicketEntity } from '../../domain/entities/tarea-ticket.entity';
import { TIPO_OPERACION_TAREA } from '../../domain/constants/tipos-operacion-tarea.constants';
import { TareaYaCompletadaError } from '../../domain/errors/tareas.errors';
import { TicketNoEncontradoError } from '../../domain/errors/tickets.errors';
import { IOperacionTicketRepository } from '../../domain/ports/i-operacion-ticket.repository';
import { ITareaTicketRepository } from '../../domain/ports/i-tarea-ticket.repository';
import { ITipoOperacionRepository } from '../../domain/ports/i-tipo-operacion.repository';
import { bloquearTicketActivo } from '../services/bloquear-ticket-activo';
import { VerificadorTicketEditable } from '../services/ticket-editable-para-tareas';
import {
  ActorTarea,
  cargarTareaDelTicket,
  cargarTicketVisible,
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
 *
 * Si el actor puede solo por ser el técnico de la tarea, la escritura exige además que siga
 * siéndolo (T13, JD-S2): si el responsable la reasignó en el medio, da el rechazo de permiso y no
 * se queda con el crédito de una tarea que ya no es suya.
 *
 * El estado del ticket sigue a sus tareas (odd/estado-por-tareas, S2-S6): en la misma transacción,
 * con la fila del ticket bloqueada ANTES de escribir la tarea, `AvanzarEstadoPorTareasService` lo
 * pone EN_PROCESO (y lo asigna a quien completa si estaba NUEVO sin responsable) o RESUELTO si era la
 * última pendiente. No pide permisos de transición ni de asignación: alcanza con poder completar.
 *
 * Con el lock tomado relee el ticket (odd/permisos-por-tipo-ticket, L45): uno borrado en el medio da
 * `TicketNoEncontradoError` (404), y sobre el releído vuelve a decidir el estado
 * (odd/cerrado-solo-comentarios): uno resuelto, cerrado o cancelado en el medio da
 * `TicketSoloComentariosError` (422) a quien no es administrador, sin escribir la tarea.
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
    private readonly avanzarEstado: Pick<AvanzarEstadoPorTareasService, 'aplicar'>,
    private readonly verificadorEditable: Pick<
      VerificadorTicketEditable,
      'verificar' | 'verificarEstado'
    >,
    private readonly ahora: () => Date = () => new Date(),
  ) {}

  async execute(dto: CompletarTareaDto): Promise<Result<TareaTicketEntity, DomainError>> {
    const ticketResult = await cargarTicketVisible(this.ticketRepo, dto.ticketId, dto.actor);
    if (ticketResult.isFail()) return Result.fail(ticketResult.getError());
    const ticket = ticketResult.getValue();

    const tareaResult = await cargarTareaDelTicket(this.tareaRepo, ticket.id, dto.tareaId);
    if (tareaResult.isFail()) return Result.fail(tareaResult.getError());
    const tarea = tareaResult.getValue();

    if (!puedeCompletarTarea(dto.actor, ticket, tarea)) {
      return Result.fail(await rechazar(this.ticketRepo, ticket, dto.actor, 'completar'));
    }
    const editable = await this.verificadorEditable.verificar(ticket, dto.actor.esAdministrador);
    if (editable.isFail()) return Result.fail(editable.getError());

    const condicion = condicionDeTecnico(dto.actor, ticket, tarea);
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

    const escritura = await this.txRunner.run(
      async (): Promise<Result<'escrita' | 'rechazada', DomainError>> => {
        const actual = await bloquearTicketActivo(this.ticketRepo, ticket.id);
        if (!actual) return Result.fail(new TicketNoEncontradoError(ticket.id));
        const vigente = await this.verificadorEditable.verificarEstado(
          actual,
          dto.actor.esAdministrador,
        );
        if (vigente.isFail()) return Result.fail(vigente.getError());
        if (!(await this.tareaRepo.completarSiPendiente(tarea, condicion))) {
          return Result.ok('rechazada');
        }
        await this.operacionRepo.save(operacion);
        await this.avanzarEstado.aplicar('COMPLETAR', ticket.id, dto.actor.id);
        return Result.ok('escrita');
      },
    );
    if (escritura.isFail()) return Result.fail(escritura.getError());
    if (escritura.getValue() === 'rechazada') {
      return Result.fail(
        await errorDeEscrituraRechazada(
          this.tareaRepo,
          tarea.id,
          errorDeCompletadoRechazado(
            this.ticketRepo,
            ticket,
            dto.actor,
            'completar',
            () => new TareaYaCompletadaError(tarea.id),
          ),
        ),
      );
    }

    return Result.ok(tarea);
  }
}
