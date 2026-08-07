import { DomainError, Result } from '../../../shared/domain/result';
import { OperacionTicketEntity } from '../../domain/entities/operacion-ticket.entity';
import { ITicketRepository } from '../../domain/ports/i-ticket.repository';
import { IOperacionTicketRepository } from '../../domain/ports/i-operacion-ticket.repository';
import { TicketNoEncontradoError } from '../../domain/errors/tickets.errors';

/**
 * DTO de entrada de `ListarTimelineUseCase`.
 *
 * `tienePermisoVerTodos`/`tienePermisoObservar` los calcula el controller a
 * partir de `user.permisos.includes(...)` — la capa de aplicación no conoce
 * el JWT, solo el resultado booleano de la política (mismo patrón que
 * `ObtenerTicketUseCase`/`ListarTicketsUseCase`, T6/T7).
 */
export interface ListarTimelineDto {
  ticketId: string;
  actorId: string;
  tienePermisoVerTodos: boolean;
  tienePermisoObservar: boolean;
}

/**
 * ListarTimelineUseCase — timeline tipado de un ticket con filtro de
 * visibilidad por `es_interno` (T18).
 *
 * Flujo:
 * 1. Carga el ticket. Si no existe o está soft-deleted → `TicketNoEncontradoError` (404).
 * 2. Reusa el MISMO scope de acceso que `ObtenerTicketUseCase` (T6): sin
 *    `ticket:ver_todos`, solo el solicitante puede ver el timeline —
 *    cualquier otro actor recibe 404 (no revela existencia). Deviación
 *    explícita: la spec T18 no lo pide literalmente, pero sin este gate un
 *    actor ajeno sin `ticket:ver_todos` podría leer el timeline PÚBLICO de
 *    CUALQUIER ticket del tenant adivinando su UUID — el mismo hueco de
 *    seguridad que T6 ya cierra para `GET /tickets/:id` (riesgo #6 del
 *    design: "un error de scoping filtraría notas internas al solicitante").
 * 3. Obtiene el timeline completo (`operacionRepo.listByTicket`, ya
 *    ordenado cronológico ASC — T12, T18).
 * 4. Sin `ticket:observar` → excluye toda operación `es_interno=true`. Con
 *    el permiso → retorna todo (públicas + internas).
 *
 * Sin throw para fallos esperados — todos se modelan con `Result.fail()`.
 *
 * Ref spec: sdd/tickets-core/spec T18, T6. Tarea: T9.3.
 */
export class ListarTimelineUseCase {
  constructor(
    private readonly ticketRepo: Pick<ITicketRepository, 'findById'>,
    private readonly operacionRepo: Pick<IOperacionTicketRepository, 'listByTicket'>,
  ) {}

  async execute(dto: ListarTimelineDto): Promise<Result<OperacionTicketEntity[], DomainError>> {
    const ticket = await this.ticketRepo.findById(dto.ticketId);
    if (!ticket || ticket.isDeleted()) {
      return Result.fail(new TicketNoEncontradoError(dto.ticketId));
    }
    if (!dto.tienePermisoVerTodos && ticket.solicitanteId !== dto.actorId) {
      return Result.fail(new TicketNoEncontradoError(dto.ticketId));
    }

    const operaciones = await this.operacionRepo.listByTicket(dto.ticketId);
    if (dto.tienePermisoObservar) {
      return Result.ok(operaciones);
    }
    return Result.ok(operaciones.filter((op) => !op.esInterno));
  }
}
