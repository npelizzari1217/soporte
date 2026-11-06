import { DomainError, Result } from '../../../shared/domain/result';
import { CertificadoAvanceEntity } from '../../domain/entities/certificado-avance.entity';
import { ICertificadoAvanceRepository } from '../../domain/ports/i-certificado-avance.repository';
import { ITicketRepository } from '../../domain/ports/i-ticket.repository';
import { AlcanceActorTicket, cargarTicketParaOperar } from '../services/visibilidad-ticket';

/**
 * ListarCertificadosUseCase — certificados de un ticket, vigentes y anulados, por número
 * (odd/edilicia-obra-externa, S5, S8). Los ve quien ve el ticket (`LECTURA` sobre su tipo y la
 * regla de fila); a cualquier otro, 404 sin revelar que existe.
 */
export class ListarCertificadosUseCase {
  constructor(
    private readonly ticketRepo: Pick<ITicketRepository, 'findById' | 'esVisiblePara'>,
    private readonly certificadoRepo: Pick<ICertificadoAvanceRepository, 'listarPorTicket'>,
  ) {}

  /**
   * @param dto Ticket y alcance del actor.
   * @returns Los certificados del ticket, o el 404 si no lo ve.
   */
  async execute(dto: {
    ticketId: string;
    alcance: AlcanceActorTicket;
  }): Promise<Result<CertificadoAvanceEntity[], DomainError>> {
    const ticket = await cargarTicketParaOperar(
      this.ticketRepo,
      dto.ticketId,
      dto.alcance,
      'LECTURA',
    );
    if (ticket.isFail()) return Result.fail(ticket.getError());
    return Result.ok(await this.certificadoRepo.listarPorTicket(dto.ticketId));
  }
}
