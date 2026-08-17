import { DomainError, Result } from '../../../shared/domain/result';
import { TicketEntity } from '../../domain/entities/ticket.entity';
import { TicketNoEncontradoError } from '../../domain/errors/tickets.errors';
import { ITicketRepository } from '../../domain/ports/i-ticket.repository';

/**
 * DTO de entrada de `ObtenerTicketUseCase`.
 *
 * `tienePermisoVerTodos` lo calcula el controller con
 * `puedeEjecutar(user, 'TICKETS:VER_TODOS')` (sdd/matriz-permisos-por-usuario,
 * R11) — la capa de aplicación no conoce el JWT, solo el resultado booleano
 * de la política (T6).
 */
export interface ObtenerTicketDto {
  ticketId: string;
  actorId: string;
  tienePermisoVerTodos: boolean;
}

/**
 * ObtenerTicketUseCase — consulta de un ticket con scope por rol (T6).
 *
 * - `ticket:ver_todos` → puede ver cualquier ticket del tenant activo.
 * - Sin el permiso (USUARIO) → solo si es el solicitante; caso contrario
 *   `TicketNoEncontradoError` (404) — NO revela la existencia del ticket
 *   a un tercero ajeno (mismo patrón que un ticket de otro tenant, que ya
 *   es 404 porque `findById` está scopeado a `TenantContext`).
 * - Un ticket soft-deleted se trata como inexistente.
 *
 * Ref spec: sdd/tickets-core/spec T6, T23. Tarea: T6.3.
 */
export class ObtenerTicketUseCase {
  constructor(private readonly ticketRepo: ITicketRepository) {}

  async execute(dto: ObtenerTicketDto): Promise<Result<TicketEntity, DomainError>> {
    const ticket = await this.ticketRepo.findById(dto.ticketId);
    if (!ticket || ticket.isDeleted()) {
      return Result.fail(new TicketNoEncontradoError(dto.ticketId));
    }
    if (!dto.tienePermisoVerTodos && ticket.solicitanteId !== dto.actorId) {
      return Result.fail(new TicketNoEncontradoError(dto.ticketId));
    }
    return Result.ok(ticket);
  }
}
