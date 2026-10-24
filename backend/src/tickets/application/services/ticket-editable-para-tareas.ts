import { DomainError, Result } from '../../../shared/domain/result';
import { TicketEntity } from '../../domain/entities/ticket.entity';
import { TareaTicketNoEditableError } from '../../domain/errors/tareas.errors';
import { IBloqueoTicketRepository } from '../../domain/ports/i-bloqueo-ticket.repository';
import { IEstadoRepository } from '../../domain/ports/i-estado.repository';
import { verificarTicketModificable } from './solo-comentarios';

/**
 * Decide si un ticket acepta cambios en sus tareas. Corre DESPUÉS de la autorización del actor:
 * un 404/403 sigue mandando antes que el 422 de esta regla.
 *
 * - En RESUELTO, CERRADO o CANCELADO, quien no es ADMINISTRADOR ni ROOT solo comenta
 *   (`TicketSoloComentariosError`, odd/cerrado-solo-comentarios S1-S3). Los administradores quedan
 *   exentos: descompletar en RESUELTO devuelve el ticket a EN_PROCESO (odd/estado-por-tareas, S4),
 *   y esa reapertura queda en sus manos.
 * - Con una compra activa vinculada, nadie, ROOT incluido (`TareaTicketNoEditableError`,
 *   odd/ticket-unificado S5).
 */
export class VerificadorTicketEditable {
  constructor(
    private readonly estadoRepo: Pick<IEstadoRepository, 'findById'>,
    private readonly bloqueoRepo: Pick<IBloqueoTicketRepository, 'estaBloqueadoPorCompra'>,
  ) {}

  /**
   * @param ticket Ticket ya cargado y autorizado.
   * @param actorEsAdministrador `true` para ADMINISTRADOR y ROOT.
   * @returns Ok, o el 422 del estado o del bloqueo por compra.
   */
  async verificar(
    ticket: TicketEntity,
    actorEsAdministrador: boolean,
  ): Promise<Result<void, DomainError>> {
    const modificable = await verificarTicketModificable(
      this.estadoRepo,
      ticket,
      actorEsAdministrador,
    );
    if (modificable.isFail()) return Result.fail(modificable.getError());

    if (await this.bloqueoRepo.estaBloqueadoPorCompra(ticket.id)) {
      return Result.fail(new TareaTicketNoEditableError());
    }
    return Result.ok(undefined);
  }
}
