import { DomainError, Result } from '../../../shared/domain/result';
import { IUsuarioTiposTicketRepository } from '../../domain/ports/i-usuario-tipos-ticket.repository';

/** DTO de entrada de `DesasociarUsuarioTipoTicketUseCase`. */
export interface DesasociarUsuarioTipoTicketDto {
  /** UUID del usuario (soft ref → master.usuarios.id). */
  usuarioId: string;
  /** UUID del tipo de ticket. */
  tipoTicketId: string;
}

/**
 * DesasociarUsuarioTipoTicketUseCase — routing: revoca la elegibilidad de
 * un usuario para atender un tipo de ticket (T3, PR8).
 *
 * Elimina físicamente la fila `(usuarioId, tipoTicketId)` — sin soft
 * delete (spec T3). Idempotente: no falla si la fila no existe
 * (`IUsuarioTiposTicketRepository.revoke`, `deleteMany` en el adapter).
 * Sin validación previa de catálogo: revocar un vínculo que ya no existe
 * (o nunca existió) no es un error — es un no-op seguro.
 *
 * Ref spec: sdd/tickets-core/spec T3. Tarea: T8.4.
 */
export class DesasociarUsuarioTipoTicketUseCase {
  constructor(
    private readonly usuarioTiposTicketRepo: Pick<IUsuarioTiposTicketRepository, 'revoke'>,
  ) {}

  async execute(dto: DesasociarUsuarioTipoTicketDto): Promise<Result<void, DomainError>> {
    await this.usuarioTiposTicketRepo.revoke(dto.usuarioId, dto.tipoTicketId);
    return Result.ok(undefined);
  }
}
