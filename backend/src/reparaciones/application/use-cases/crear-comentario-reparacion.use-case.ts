import { DomainError, Result } from '../../../shared/domain/result';
import { OperacionTicketEntity } from '../../../tickets/domain/entities/operacion-ticket.entity';
import { TareaTicketNoEditableError } from '../../../tickets/domain/errors/tareas.errors';
import { IOperacionTicketRepository } from '../../../tickets/domain/ports/i-operacion-ticket.repository';
import { ITicketRepository } from '../../../tickets/domain/ports/i-ticket.repository';
import { ITipoOperacionRepository } from '../../../tickets/domain/ports/i-tipo-operacion.repository';
import { VerificadorTicketEditable } from '../../../tickets/application/services/ticket-editable-para-tareas';
import {
  AlcanceActorTicket,
  cargarTicketParaOperar,
} from '../../../tickets/application/services/visibilidad-ticket';
import { ComentarioReparacionNoPermitidoError } from '../../domain/errors/reparaciones.errors';
import { COMENTARIO_TEXTO_MAX_LENGTH } from '../../domain/entities/comentario-reparacion.entity';

/** DTO de entrada para crear un comentario desde Edilicia. */
export interface CrearComentarioReparacionDto {
  /** UUID del ticket que se comenta. */
  ticketId: string;
  /** Cuerpo del comentario, ya recortado y acotado por el DTO HTTP. */
  texto: string;
  /** UUID del autor (soft ref → master.usuarios; extraído del JWT). */
  autorId: string;
  /** Permisos por tipo del autor (odd/permisos-por-tipo-ticket, D5 c). */
  alcance: AlcanceActorTicket;
}

/**
 * CrearComentarioReparacionUseCase — asienta una nota sobre el ticket desde Edilicia (ej. "falta
 * el repuesto X", el caso que motivó la feature).
 *
 * Desde odd/ticket-unificado (S3) el comentario es un COMENTARIO del timeline del ticket, el mismo
 * lugar que los comentarios hechos desde Tickets: va PÚBLICO, porque el comentario de reparación
 * nunca tuvo visibilidad propia y lo veía todo el que veía la reparación. Conserva las reglas que
 * tenía hasta que T3 pase la pantalla al comentario del ticket:
 * 1. Exige ver el ticket (404 si no) y `ALTAS` o `COMENTAR` sobre su tipo (403;
 *    odd/permisos-por-tipo-ticket, D5 c).
 * 2. Aplica la MISMA regla que las tareas (odd/ticket-cerrado-solo-lectura, S3): CERRADO,
 *    CANCELADO o bloqueado por una compra → `ComentarioReparacionNoPermitidoError` (422).
 * 3. Inserta la operación. No publica `TicketComentadoEvent` ni registra la primera respuesta: un
 *    comentario de reparación nunca notificó al solicitante ni movió el SLA, y eso no cambia por
 *    haber cambiado de tabla. Un INSERT único: sin transacción.
 *
 * Sin throw para fallos esperados — se modelan con `Result.fail()`.
 */
export class CrearComentarioReparacionUseCase {
  constructor(
    private readonly ticketRepo: Pick<ITicketRepository, 'findById' | 'esVisiblePara'>,
    private readonly operacionRepo: Pick<IOperacionTicketRepository, 'save'>,
    private readonly tipoOperacionRepo: Pick<ITipoOperacionRepository, 'findIdByCodigo'>,
    private readonly verificadorEditable: Pick<VerificadorTicketEditable, 'verificar'>,
  ) {}

  /**
   * @param dto Ticket, texto, autor y alcance.
   * @returns La operación COMENTARIO creada; 404, 403 o 422 según corresponda.
   */
  async execute(
    dto: CrearComentarioReparacionDto,
  ): Promise<Result<OperacionTicketEntity, DomainError>> {
    // Precondición, no fallo esperado: el DTO HTTP ya recorta y acota el texto, así que un texto
    // vacío o largo acá es un bug del caller (mismo criterio que la entidad de comentario de antes).
    const texto = dto.texto.trim();
    if (texto.length === 0 || texto.length > COMENTARIO_TEXTO_MAX_LENGTH) {
      throw new Error(
        `CrearComentarioReparacionUseCase: el texto tiene que tener entre 1 y ${COMENTARIO_TEXTO_MAX_LENGTH} caracteres.`,
      );
    }

    const acceso = await cargarTicketParaOperar(this.ticketRepo, dto.ticketId, dto.alcance, {
      algunaDe: ['ALTAS', 'COMENTAR'],
    });
    if (acceso.isFail()) {
      return Result.fail(acceso.getError());
    }
    const editable = await this.verificadorEditable.verificar(acceso.getValue());
    if (editable.isFail()) {
      const error = editable.getError();
      return Result.fail(
        error instanceof TareaTicketNoEditableError
          ? new ComentarioReparacionNoPermitidoError(error.motivo)
          : error,
      );
    }

    // Catálogo FIJO garantizado por el seed: su ausencia es un bug de infraestructura, no un error
    // del caller (mismo throw defensivo que `CrearComentarioUseCase`).
    const tipoOperacionId = await this.tipoOperacionRepo.findIdByCodigo('COMENTARIO');
    if (!tipoOperacionId) {
      throw new Error(
        'Catálogo de tipo_operacion inconsistente: no existe "COMENTARIO" en el tenant activo.',
      );
    }

    const comentario = OperacionTicketEntity.create({
      ticketId: dto.ticketId,
      tipoOperacionId,
      descripcion: texto,
      estadoAnteriorId: null,
      estadoNuevoId: null,
      autorId: dto.autorId,
      esInterno: false,
      metadata: null,
    });
    await this.operacionRepo.save(comentario);

    return Result.ok(comentario);
  }
}
