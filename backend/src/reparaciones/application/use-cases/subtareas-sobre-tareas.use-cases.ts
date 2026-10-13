import { DomainError, Result } from '../../../shared/domain/result';
import { ActorTarea } from '../../../tickets/application/services/tareas-ticket.reglas';
import { CompletarTareaUseCase } from '../../../tickets/application/use-cases/completar-tarea.use-case';
import { CrearTareaTicketUseCase } from '../../../tickets/application/use-cases/crear-tarea-ticket.use-case';
import { EliminarTareaUseCase } from '../../../tickets/application/use-cases/eliminar-tarea.use-case';
import { TareaTicketEntity } from '../../../tickets/domain/entities/tarea-ticket.entity';
import { TareaNoEncontradaError } from '../../../tickets/domain/errors/tareas.errors';
import { ITareaTicketRepository } from '../../../tickets/domain/ports/i-tarea-ticket.repository';
import {
  SubtareaNoEncontradaError,
  TicketEdiliciaNoEncontradoError,
} from '../../domain/errors/reparaciones.errors';
import { ITicketEdiliciaRepository } from '../../domain/ports/i-ticket-edilicia.repository';

/**
 * Subtareas de Edilicia sobre la tabla genérica de tareas (odd/tareas-con-tecnico, T3).
 *
 * Las rutas viejas de `ReparacionesController` siguen vivas para el frontend actual hasta T6, y
 * T8 las retira junto con estas clases. Traducen la reparación (`ticket_edilicia.id`) a su
 * `ticket_id` y delegan en los casos de uso de tareas del ticket, que aplican la regla de la
 * decisión de producto (CA3, CA4) y escriben el historial. La migración de T1 conservó los ids,
 * así que el id de una subtarea es el id de su tarea.
 *
 * Devuelven la tarea junto con el `ticketEdiliciaId`, que la respuesta vieja todavía expone.
 */
export interface SubtareaSobreTarea {
  tarea: TareaTicketEntity;
  ticketEdiliciaId: string;
}

/** Una tarea de otro ticket o inexistente es, para la ruta vieja, una subtarea no encontrada. */
function comoSubtarea(error: DomainError, subtareaId: string): DomainError {
  return error instanceof TareaNoEncontradaError
    ? new SubtareaNoEncontradaError(subtareaId)
    : error;
}

/**
 * Resuelve la tarea activa de un ticket edilicio. Si no existe, está dada de baja o su ticket no
 * es una reparación, la ruta vieja responde que la subtarea no existe.
 */
async function cargarSubtarea(
  deps: {
    tareaRepo: Pick<ITareaTicketRepository, 'buscarPorId'>;
    ediliciaRepo: Pick<ITicketEdiliciaRepository, 'findByTicketId'>;
  },
  subtareaId: string,
): Promise<Result<{ ticketId: string; ticketEdiliciaId: string }, DomainError>> {
  const tarea = await deps.tareaRepo.buscarPorId(subtareaId);
  if (!tarea || tarea.isDeleted()) return Result.fail(new SubtareaNoEncontradaError(subtareaId));
  const edilicia = await deps.ediliciaRepo.findByTicketId(tarea.ticketId);
  if (!edilicia) return Result.fail(new SubtareaNoEncontradaError(subtareaId));
  return Result.ok({ ticketId: tarea.ticketId, ticketEdiliciaId: edilicia.id });
}

/** `POST /reparaciones/:reparacionId/subtareas` → `CrearTareaTicketUseCase`. */
export class CrearSubtareaSobreTareaUseCase {
  constructor(
    private readonly ediliciaRepo: Pick<ITicketEdiliciaRepository, 'findById'>,
    private readonly crearTarea: Pick<CrearTareaTicketUseCase, 'execute'>,
  ) {}

  async execute(dto: {
    reparacionId: string;
    descripcion: string;
    actor: ActorTarea;
  }): Promise<Result<SubtareaSobreTarea, DomainError>> {
    const edilicia = await this.ediliciaRepo.findById(dto.reparacionId);
    if (!edilicia) return Result.fail(new TicketEdiliciaNoEncontradoError(dto.reparacionId));

    const result = await this.crearTarea.execute({
      ticketId: edilicia.ticketId,
      actor: dto.actor,
      descripcion: dto.descripcion,
    });
    if (result.isFail()) return Result.fail(result.getError());
    return Result.ok({ tarea: result.getValue(), ticketEdiliciaId: edilicia.id });
  }
}

/** `POST /reparaciones/subtareas/:subtareaId/completar` → `CompletarTareaUseCase`. */
export class CompletarSubtareaSobreTareaUseCase {
  constructor(
    private readonly tareaRepo: Pick<ITareaTicketRepository, 'buscarPorId'>,
    private readonly ediliciaRepo: Pick<ITicketEdiliciaRepository, 'findByTicketId'>,
    private readonly completarTarea: Pick<CompletarTareaUseCase, 'execute'>,
  ) {}

  async execute(dto: {
    subtareaId: string;
    actor: ActorTarea;
  }): Promise<Result<SubtareaSobreTarea, DomainError>> {
    const subtarea = await cargarSubtarea(
      { tareaRepo: this.tareaRepo, ediliciaRepo: this.ediliciaRepo },
      dto.subtareaId,
    );
    if (subtarea.isFail()) return Result.fail(subtarea.getError());
    const { ticketId, ticketEdiliciaId } = subtarea.getValue();

    const result = await this.completarTarea.execute({
      ticketId,
      tareaId: dto.subtareaId,
      actor: dto.actor,
    });
    if (result.isFail()) return Result.fail(comoSubtarea(result.getError(), dto.subtareaId));
    return Result.ok({ tarea: result.getValue(), ticketEdiliciaId });
  }
}

/** `DELETE /reparaciones/subtareas/:subtareaId` → `EliminarTareaUseCase`. */
export class EliminarSubtareaSobreTareaUseCase {
  constructor(
    private readonly tareaRepo: Pick<ITareaTicketRepository, 'buscarPorId'>,
    private readonly ediliciaRepo: Pick<ITicketEdiliciaRepository, 'findByTicketId'>,
    private readonly eliminarTarea: Pick<EliminarTareaUseCase, 'execute'>,
  ) {}

  async execute(dto: {
    subtareaId: string;
    actor: ActorTarea;
  }): Promise<Result<void, DomainError>> {
    const subtarea = await cargarSubtarea(
      { tareaRepo: this.tareaRepo, ediliciaRepo: this.ediliciaRepo },
      dto.subtareaId,
    );
    if (subtarea.isFail()) return Result.fail(subtarea.getError());

    const result = await this.eliminarTarea.execute({
      ticketId: subtarea.getValue().ticketId,
      tareaId: dto.subtareaId,
      actor: dto.actor,
    });
    if (result.isFail()) return Result.fail(comoSubtarea(result.getError(), dto.subtareaId));
    return Result.ok(undefined);
  }
}
