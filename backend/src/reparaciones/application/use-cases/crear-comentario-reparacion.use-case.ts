import { DomainError, Result } from '../../../shared/domain/result';
import { TareaTicketNoEditableError } from '../../../tickets/domain/errors/tareas.errors';
import { ITicketRepository } from '../../../tickets/domain/ports/i-ticket.repository';
import { VerificadorTicketEditable } from '../../../tickets/application/services/ticket-editable-para-tareas';
import { ComentarioReparacionEntity } from '../../domain/entities/comentario-reparacion.entity';
import { ITicketEdiliciaRepository } from '../../domain/ports/i-ticket-edilicia.repository';
import { IComentarioReparacionRepository } from '../../domain/ports/i-comentario-reparacion.repository';
import { ComentarioReparacionNoPermitidoError } from '../../domain/errors/reparaciones.errors';
import { AlcanceActorTicket } from '../../../tickets/application/services/visibilidad-ticket';
import { cargarReparacionParaOperar } from '../services/acceso-reparacion';

/** DTO de entrada para crear un comentario de reparación. */
export interface CrearComentarioReparacionDto {
  /** UUID del `ticket_edilicia` (la reparación) que se comenta. */
  ticketEdiliciaId: string;
  /** Cuerpo del comentario. Se persiste recortado (lo hace la entidad). */
  texto: string;
  /** UUID del autor (soft ref → master.usuarios; extraído del JWT). */
  autorId: string;
  /** Permisos por tipo del autor (odd/permisos-por-tipo-ticket, D5 c). */
  alcance: AlcanceActorTicket;
}

/**
 * CrearComentarioReparacionUseCase — asienta una nota sobre una reparación
 * (ej. "falta el repuesto X", el caso que motivó la feature).
 *
 * Flujo:
 * 1. Carga el `ticket_edilicia` → `TicketEdiliciaNoEncontradoError` si no
 *    existe o está eliminado.
 * 1b. Carga su ticket base y exige verlo (si no, el mismo 404 que una
 *    reparación inexistente) y `ALTAS` o `COMENTAR` sobre su tipo (si no, 403;
 *    odd/permisos-por-tipo-ticket, D5 c). `ALTAS` porque es lo que hoy da
 *    `EDILICIA:ALTAS`, la celda que exigía la ruta; `COMENTAR`, la acción de D5 c.
 * 2. Aplica sobre el ticket la MISMA regla que las tareas
 *    (odd/ticket-cerrado-solo-lectura, S3): CERRADO, CANCELADO o bloqueada
 *    por una compra → `ComentarioReparacionNoPermitidoError` (422). Listar
 *    no pasa por acá: ver sigue permitido.
 * 3. Crea la `ComentarioReparacionEntity` (recorta y valida el texto).
 * 4. Persiste (INSERT único — sin transacción: no hay operación de
 *    timeline que escribir junto, así que no hay nada que hacer atómico).
 *
 * Sin throw para fallos esperados — se modelan con `Result.fail()`.
 */
export class CrearComentarioReparacionUseCase {
  constructor(
    private readonly ticketEdiliciaRepo: Pick<ITicketEdiliciaRepository, 'findById'>,
    private readonly comentarioRepo: Pick<IComentarioReparacionRepository, 'crear'>,
    private readonly ticketRepo: Pick<ITicketRepository, 'findById' | 'esVisiblePara'>,
    private readonly verificadorEditable: Pick<VerificadorTicketEditable, 'verificar'>,
  ) {}

  async execute(
    dto: CrearComentarioReparacionDto,
  ): Promise<Result<ComentarioReparacionEntity, DomainError>> {
    const acceso = await cargarReparacionParaOperar(
      this.ticketEdiliciaRepo,
      this.ticketRepo,
      dto.ticketEdiliciaId,
      dto.alcance,
      { algunaDe: ['ALTAS', 'COMENTAR'] },
    );
    if (acceso.isFail()) {
      return Result.fail(acceso.getError());
    }
    const { ticket } = acceso.getValue();
    const editable = await this.verificadorEditable.verificar(ticket);
    if (editable.isFail()) {
      const error = editable.getError();
      return Result.fail(
        error instanceof TareaTicketNoEditableError
          ? new ComentarioReparacionNoPermitidoError(error.motivo)
          : error,
      );
    }

    const comentario = ComentarioReparacionEntity.create({
      ticketEdiliciaId: dto.ticketEdiliciaId,
      texto: dto.texto,
      autorId: dto.autorId,
    });

    await this.comentarioRepo.crear(comentario);

    return Result.ok(comentario);
  }
}
