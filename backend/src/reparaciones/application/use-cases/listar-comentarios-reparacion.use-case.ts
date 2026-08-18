import { DomainError, Result } from '../../../shared/domain/result';
import { ComentarioReparacionEntity } from '../../domain/entities/comentario-reparacion.entity';
import { ITicketEdiliciaRepository } from '../../domain/ports/i-ticket-edilicia.repository';
import { IComentarioReparacionRepository } from '../../domain/ports/i-comentario-reparacion.repository';
import { TicketEdiliciaNoEncontradoError } from '../../domain/errors/reparaciones.errors';

/**
 * ListarComentariosReparacionUseCase — devuelve los comentarios de una
 * reparación, más nuevo primero (el orden lo garantiza el repositorio).
 *
 * Valida que la reparación exista ANTES de listar, en vez de devolver `[]`:
 * un id inexistente y una reparación sin comentarios son dos situaciones
 * distintas, y colapsarlas en la misma respuesta vacía esconde el error del
 * caller.
 */
export class ListarComentariosReparacionUseCase {
  constructor(
    private readonly ticketEdiliciaRepo: Pick<ITicketEdiliciaRepository, 'findById'>,
    private readonly comentarioRepo: Pick<
      IComentarioReparacionRepository,
      'listarPorTicketEdilicia'
    >,
  ) {}

  async execute(
    ticketEdiliciaId: string,
  ): Promise<Result<ComentarioReparacionEntity[], DomainError>> {
    const ticketEdilicia = await this.ticketEdiliciaRepo.findById(ticketEdiliciaId);
    if (!ticketEdilicia || ticketEdilicia.isDeleted()) {
      return Result.fail(new TicketEdiliciaNoEncontradoError(ticketEdiliciaId));
    }

    const comentarios = await this.comentarioRepo.listarPorTicketEdilicia(ticketEdiliciaId);

    return Result.ok(comentarios);
  }
}
