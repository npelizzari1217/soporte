import { DomainError, Result } from '../../../shared/domain/result';
import { ComentarioReparacionEntity } from '../../domain/entities/comentario-reparacion.entity';
import { ITicketEdiliciaRepository } from '../../domain/ports/i-ticket-edilicia.repository';
import { IComentarioReparacionRepository } from '../../domain/ports/i-comentario-reparacion.repository';
import { ITicketRepository } from '../../../tickets/domain/ports/i-ticket.repository';
import { AlcanceActorTicket } from '../../../tickets/application/services/visibilidad-ticket';
import { cargarReparacionParaOperar } from '../services/acceso-reparacion';

/**
 * ListarComentariosReparacionUseCase — devuelve los comentarios de una
 * reparación, más nuevo primero (el orden lo garantiza el repositorio).
 *
 * Valida que la reparación exista ANTES de listar, en vez de devolver `[]`:
 * un id inexistente y una reparación sin comentarios son dos situaciones
 * distintas, y colapsarlas en la misma respuesta vacía esconde el error del
 * caller. Un actor que no ve el ticket base (`LECTURA` sobre su tipo y regla de
 * fila, odd/permisos-por-tipo-ticket D5 b) recibe el mismo 404 que una
 * reparación inexistente.
 */
export class ListarComentariosReparacionUseCase {
  constructor(
    private readonly ticketEdiliciaRepo: Pick<ITicketEdiliciaRepository, 'findById'>,
    private readonly comentarioRepo: Pick<
      IComentarioReparacionRepository,
      'listarPorTicketEdilicia'
    >,
    private readonly ticketRepo: Pick<ITicketRepository, 'findById' | 'esVisiblePara'>,
  ) {}

  /**
   * @param ticketEdiliciaId Id de la reparación.
   * @param alcance Permisos por tipo del actor.
   * @returns Los comentarios, o 404 si la reparación no existe o el actor no la ve.
   */
  async execute(
    ticketEdiliciaId: string,
    alcance: AlcanceActorTicket,
  ): Promise<Result<ComentarioReparacionEntity[], DomainError>> {
    const acceso = await cargarReparacionParaOperar(
      this.ticketEdiliciaRepo,
      this.ticketRepo,
      ticketEdiliciaId,
      alcance,
    );
    if (acceso.isFail()) {
      return Result.fail(acceso.getError());
    }

    const comentarios = await this.comentarioRepo.listarPorTicketEdilicia(ticketEdiliciaId);

    return Result.ok(comentarios);
  }
}
