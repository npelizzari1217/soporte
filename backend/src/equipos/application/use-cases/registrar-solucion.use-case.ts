import { DomainError, Result } from '../../../shared/domain/result';
import { TicketSoporteEntity } from '../../domain/entities/ticket-soporte.entity';
import { ITicketSoporteRepository } from '../../domain/ports/i-ticket-soporte.repository';
import { TicketSoporteNoEncontradoError } from '../../domain/errors/equipos.errors';
import { ITicketRepository } from '../../../tickets/domain/ports/i-ticket.repository';
import { ITipoTicketRepository } from '../../../tickets/domain/ports/i-tipo-ticket.repository';
import { TicketNoEncontradoError } from '../../../tickets/domain/errors/tickets.errors';
import {
  AlcanceActorTicket,
  esTicketAccesiblePara,
} from '../../../tickets/application/services/visibilidad-ticket';

/**
 * DTO de entrada para registrar la solución aplicada a un ticket de soporte (F3-Q5). El alcance
 * del actor lo arma el controller desde el JWT (`alcanceTicketDesdeJwt`).
 */
export interface RegistrarSolucionDto extends AlcanceActorTicket {
  ticketId: string;
  solucion: string;
}

/**
 * RegistrarSolucionUseCase — registra la solución aplicada a un ticket de
 * soporte (F3-Q5).
 *
 * Flujo:
 * 0. Carga el ticket base: si no existe, está soft-deleted o el actor no lo ve
 *    (`esTicketAccesiblePara`: módulo del tipo y visibilidad de fila,
 *    odd/permisos-por-tipo-ticket S0) → `TicketNoEncontradoError` (404), sin escribir.
 * 1. Busca el satélite `ticket_soporte` por `ticketId` →
 *    `TicketSoporteNoEncontradoError` si no existe.
 * 2. Setea `solucionAplicada` vía `registrarSolucion()` y persiste.
 *
 * Sin throw — todos los fallos esperados retornan `Result.fail()`.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-Q5. Tarea: T13.3.
 */
export class RegistrarSolucionUseCase {
  constructor(
    private readonly ticketSoporteRepo: Pick<ITicketSoporteRepository, 'findByTicketId' | 'save'>,
    private readonly ticketRepo: Pick<ITicketRepository, 'findById' | 'esVisiblePara'>,
    private readonly tipoTicketRepo: Pick<ITipoTicketRepository, 'findById'>,
  ) {}

  async execute(dto: RegistrarSolucionDto): Promise<Result<TicketSoporteEntity, DomainError>> {
    const ticket = await this.ticketRepo.findById(dto.ticketId);
    if (
      !ticket ||
      ticket.isDeleted() ||
      !(await esTicketAccesiblePara(
        { ticketRepo: this.ticketRepo, tipoTicketRepo: this.tipoTicketRepo },
        ticket,
        dto,
      ))
    ) {
      return Result.fail(new TicketNoEncontradoError(dto.ticketId));
    }

    const ticketSoporte = await this.ticketSoporteRepo.findByTicketId(dto.ticketId);
    if (!ticketSoporte) {
      return Result.fail(new TicketSoporteNoEncontradoError(dto.ticketId));
    }

    ticketSoporte.registrarSolucion(dto.solucion);
    await this.ticketSoporteRepo.save(ticketSoporte);

    return Result.ok(ticketSoporte);
  }
}
