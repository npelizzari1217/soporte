import { DomainError, Result } from '../../../shared/domain/result';
import { OperacionTicketEntity } from '../../../tickets/domain/entities/operacion-ticket.entity';
import { ITipoOperacionRepository } from '../../../tickets/domain/ports/i-tipo-operacion.repository';
import { ListarTimelineUseCase } from '../../../tickets/application/use-cases/listar-timeline.use-case';
import { AlcanceActorTicket } from '../../../tickets/application/services/visibilidad-ticket';

/**
 * ListarComentariosReparacionUseCase — los comentarios del ticket para el panel de Edilicia, más
 * nuevo primero (el motivo de la demora que se está buscando es siempre el último asentado).
 *
 * Desde odd/ticket-unificado (S3) son los COMENTARIO del timeline del ticket, los mismos que se ven
 * desde Tickets: compone `ListarTimelineUseCase`, así que hereda su acceso (404 si el actor no ve
 * el ticket, sin revelar que existe) y su visibilidad (los internos, solo con `OBSERVAR` sobre el
 * tipo). Un ticket sin comentarios devuelve `[]`, distinto del 404 de un ticket que no existe.
 */
export class ListarComentariosReparacionUseCase {
  constructor(
    private readonly listarTimeline: Pick<ListarTimelineUseCase, 'execute'>,
    private readonly tipoOperacionRepo: Pick<ITipoOperacionRepository, 'findIdByCodigo'>,
  ) {}

  /**
   * @param ticketId Id del ticket.
   * @param alcance Permisos por tipo del actor.
   * @returns Los comentarios visibles para el actor, del más nuevo al más viejo.
   */
  async execute(
    ticketId: string,
    alcance: AlcanceActorTicket,
  ): Promise<Result<OperacionTicketEntity[], DomainError>> {
    const timeline = await this.listarTimeline.execute({ ticketId, ...alcance });
    if (timeline.isFail()) return Result.fail(timeline.getError());

    // Catálogo FIJO garantizado por el seed: su ausencia es un bug de infraestructura.
    const tipoComentarioId = await this.tipoOperacionRepo.findIdByCodigo('COMENTARIO');
    if (!tipoComentarioId) {
      throw new Error(
        'Catálogo de tipo_operacion inconsistente: no existe "COMENTARIO" en el tenant activo.',
      );
    }

    // Desempate por id: es UUIDv7, monótono en el tiempo, así que dos comentarios del mismo
    // milisegundo conservan un orden determinístico.
    const comentarios = timeline
      .getValue()
      .filter((op) => op.tipoOperacionId === tipoComentarioId)
      .sort(
        (a, b) =>
          b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0),
      );
    return Result.ok(comentarios);
  }
}
