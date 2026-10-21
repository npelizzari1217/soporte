import { DomainError, Result } from '../../../shared/domain/result';
import { TicketEntity } from '../../domain/entities/ticket.entity';
import { TicketNoEncontradoError } from '../../domain/errors/tickets.errors';
import { ITicketRepository } from '../../domain/ports/i-ticket.repository';
import { ITipoTicketRepository } from '../../domain/ports/i-tipo-ticket.repository';
import { AlcanceActorTicket, esTicketAccesiblePara } from '../services/visibilidad-ticket';

/**
 * DTO de entrada de `ObtenerTicketUseCase`.
 *
 * `tienePermisoVerTodos` lo calcula el controller con
 * `puedeEjecutar(user, 'TICKETS:VER_TODOS')` (sdd/matriz-permisos-por-usuario,
 * R11) — la capa de aplicación no conoce el JWT, solo el resultado booleano
 * de la política (T6).
 */
export interface ObtenerTicketDto extends AlcanceActorTicket {
  ticketId: string;
}

/**
 * ObtenerTicketUseCase — consulta de un ticket con scope por rol (T6).
 *
 * - `ticket:ver_todos` → puede ver cualquier ticket del tenant activo.
 * - Sin el permiso → solo si es el solicitante o el técnico de una tarea
 *   activa del ticket (`esTicketVisiblePara`, CA10); caso contrario
 *   `TicketNoEncontradoError` (404) — NO revela la existencia del ticket
 *   a un tercero ajeno (mismo patrón que un ticket de otro tenant, que ya
 *   es 404 porque `findById` está scopeado a `TenantContext`).
 * - Un ticket de un tipo de un módulo ajeno al actor también es 404, aunque lo haya solicitado
 *   (`esTicketAccesiblePara`, odd/permisos-por-tipo-ticket S0).
 * - Un ticket soft-deleted se trata como inexistente.
 *
 * Ref spec: sdd/tickets-core/spec T6, T23. Tarea: T6.3.
 */
export class ObtenerTicketUseCase {
  constructor(
    private readonly ticketRepo: Pick<ITicketRepository, 'findById' | 'esVisiblePara'>,
    private readonly tipoTicketRepo: Pick<ITipoTicketRepository, 'findById'>,
  ) {}

  async execute(dto: ObtenerTicketDto): Promise<Result<TicketEntity, DomainError>> {
    const ticket = await this.ticketRepo.findById(dto.ticketId);
    if (!ticket || ticket.isDeleted()) {
      return Result.fail(new TicketNoEncontradoError(dto.ticketId));
    }
    if (
      !(await esTicketAccesiblePara(
        { ticketRepo: this.ticketRepo, tipoTicketRepo: this.tipoTicketRepo },
        ticket,
        dto,
      ))
    ) {
      return Result.fail(new TicketNoEncontradoError(dto.ticketId));
    }
    return Result.ok(ticket);
  }
}
