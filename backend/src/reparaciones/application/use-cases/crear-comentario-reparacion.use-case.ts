import { DomainError, Result } from '../../../shared/domain/result';
import { ComentarioReparacionEntity } from '../../domain/entities/comentario-reparacion.entity';
import { ITicketEdiliciaRepository } from '../../domain/ports/i-ticket-edilicia.repository';
import { IComentarioReparacionRepository } from '../../domain/ports/i-comentario-reparacion.repository';
import { TicketEdiliciaNoEncontradoError } from '../../domain/errors/reparaciones.errors';

/** DTO de entrada para crear un comentario de reparación. */
export interface CrearComentarioReparacionDto {
  /** UUID del `ticket_edilicia` (la reparación) que se comenta. */
  ticketEdiliciaId: string;
  /** Cuerpo del comentario. Se persiste recortado (lo hace la entidad). */
  texto: string;
  /** UUID del autor (soft ref → master.usuarios; extraído del JWT). */
  autorId: string;
}

/**
 * CrearComentarioReparacionUseCase — asienta una nota sobre una reparación
 * (ej. "falta el repuesto X", el caso que motivó la feature).
 *
 * Flujo:
 * 1. Carga el `ticket_edilicia` → `TicketEdiliciaNoEncontradoError` si no
 *    existe o está eliminado.
 * 2. Crea la `ComentarioReparacionEntity` (recorta y valida el texto).
 * 3. Persiste (INSERT único — sin transacción, a diferencia de
 *    `CrearSubtareaUseCase`: no hay avance que recalcular ni operación de
 *    timeline que escribir junto, así que no hay nada que hacer atómico).
 *
 * Sin throw para fallos esperados — se modelan con `Result.fail()`.
 */
export class CrearComentarioReparacionUseCase {
  constructor(
    private readonly ticketEdiliciaRepo: Pick<ITicketEdiliciaRepository, 'findById'>,
    private readonly comentarioRepo: Pick<IComentarioReparacionRepository, 'crear'>,
  ) {}

  async execute(
    dto: CrearComentarioReparacionDto,
  ): Promise<Result<ComentarioReparacionEntity, DomainError>> {
    const ticketEdilicia = await this.ticketEdiliciaRepo.findById(dto.ticketEdiliciaId);
    if (!ticketEdilicia || ticketEdilicia.isDeleted()) {
      return Result.fail(new TicketEdiliciaNoEncontradoError(dto.ticketEdiliciaId));
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
