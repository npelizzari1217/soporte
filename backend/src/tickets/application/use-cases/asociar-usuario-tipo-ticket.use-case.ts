import { DomainError, Result } from '../../../shared/domain/result';
import { ITipoTicketRepository } from '../../domain/ports/i-tipo-ticket.repository';
import { IUsuarioTiposTicketRepository } from '../../domain/ports/i-usuario-tipos-ticket.repository';
import { TipoTicketNoEncontradoError } from '../../domain/errors/tickets.errors';

/** DTO de entrada de `AsociarUsuarioTipoTicketUseCase`. */
export interface AsociarUsuarioTipoTicketDto {
  /** UUID del usuario (soft ref → master.usuarios.id). */
  usuarioId: string;
  /** UUID del tipo de ticket (FK real → tipos_ticket.id, misma DB tenant). */
  tipoTicketId: string;
}

/**
 * AsociarUsuarioTipoTicketUseCase — routing: habilita a un usuario para
 * atender un tipo de ticket (T3, PR8).
 *
 * Flujo:
 * 1. Valida que `tipoTicketId` exista en el catálogo del tenant — si no,
 *    `TipoTicketNoEncontradoError` (422). Convierte lo que de otro modo
 *    sería una violación de FK cruda de Prisma (el schema real tiene FK
 *    física `usuario_tipos_ticket.tipo_ticket_id → tipos_ticket.id`) en un
 *    `DomainError` limpio, mismo patrón que el resto de los use cases.
 * 2. Crea la fila físicamente (`IUsuarioTiposTicketRepository.assign`,
 *    idempotente — no falla si ya existe la misma PK compuesta).
 *
 * Sin transacción dedicada: es un INSERT único sin operación de timeline
 * asociada (T3 no lo requiere, a diferencia de T4/T12/T14/T22 — T24 no
 * lista el routing entre las mutaciones que exigen atomicidad con el
 * timeline).
 *
 * Ref spec: sdd/tickets-core/spec T3. Tarea: T8.4.
 */
export class AsociarUsuarioTipoTicketUseCase {
  constructor(
    private readonly tipoTicketRepo: Pick<ITipoTicketRepository, 'findById'>,
    private readonly usuarioTiposTicketRepo: Pick<IUsuarioTiposTicketRepository, 'assign'>,
  ) {}

  async execute(dto: AsociarUsuarioTipoTicketDto): Promise<Result<void, DomainError>> {
    const tipoTicket = await this.tipoTicketRepo.findById(dto.tipoTicketId);
    if (!tipoTicket) {
      return Result.fail(new TipoTicketNoEncontradoError(dto.tipoTicketId));
    }

    await this.usuarioTiposTicketRepo.assign(dto.usuarioId, dto.tipoTicketId);

    return Result.ok(undefined);
  }
}
