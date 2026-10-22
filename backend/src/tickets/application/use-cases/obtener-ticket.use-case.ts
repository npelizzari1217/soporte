import { DomainError, Result } from '../../../shared/domain/result';
import { TicketEntity } from '../../domain/entities/ticket.entity';
import { ITicketRepository } from '../../domain/ports/i-ticket.repository';
import { AlcanceActorTicket, cargarTicketParaOperar } from '../services/visibilidad-ticket';

/**
 * DTO de entrada de `ObtenerTicketUseCase`. El alcance del actor (`AlcanceActorTicket`) lo carga
 * la capa de interface por request; la capa de aplicación no conoce el JWT.
 */
export interface ObtenerTicketDto extends AlcanceActorTicket {
  ticketId: string;
}

/**
 * ObtenerTicketUseCase — consulta de un ticket con scope por tipo y fila (T6,
 * odd/permisos-por-tipo-ticket S3).
 *
 * - Exige `LECTURA` sobre el tipo del ticket y, además, `VER_TODOS` sobre ese
 *   tipo o ser el solicitante, el responsable o el técnico de una tarea activa
 *   (`esTicketAccesiblePara`); caso contrario `TicketNoEncontradoError` (404) —
 *   NO revela la existencia del ticket a un tercero ajeno (mismo patrón que un
 *   ticket de otro tenant, que ya es 404 porque `findById` está scopeado a
 *   `TenantContext`).
 * - Un ticket soft-deleted se trata como inexistente.
 *
 * Ref spec: sdd/tickets-core/spec T6, T23. Tarea: T6.3.
 */
export class ObtenerTicketUseCase {
  constructor(private readonly ticketRepo: Pick<ITicketRepository, 'findById' | 'esVisiblePara'>) {}

  async execute(dto: ObtenerTicketDto): Promise<Result<TicketEntity, DomainError>> {
    return cargarTicketParaOperar(this.ticketRepo, dto.ticketId, dto, 'LECTURA');
  }
}
