import { DomainError, Result } from '../../../shared/domain/result';
import { TicketSoporteEntity } from '../../domain/entities/ticket-soporte.entity';
import { ITicketSoporteRepository } from '../../domain/ports/i-ticket-soporte.repository';
import { TicketSoporteNoEncontradoError } from '../../domain/errors/equipos.errors';
import { ITicketRepository } from '../../../tickets/domain/ports/i-ticket.repository';
import {
  AlcanceActorTicket,
  cargarTicketParaOperar,
} from '../../../tickets/application/services/visibilidad-ticket';

/**
 * DTO de entrada para registrar la solución aplicada a un ticket de soporte (F3-Q5). El alcance
 * del actor lo carga la capa de interface por request.
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
 *    (`esTicketAccesiblePara`: `LECTURA` sobre el tipo y fila) → `TicketNoEncontradoError`
 *    (404); si lo ve sin `MODIFICACION` sobre el tipo → `AccionSobreTipoNoPermitidaError`
 *    (403, odd/permisos-por-tipo-ticket D5 c). En los dos casos, sin escribir.
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
  ) {}

  async execute(dto: RegistrarSolucionDto): Promise<Result<TicketSoporteEntity, DomainError>> {
    const acceso = await cargarTicketParaOperar(this.ticketRepo, dto.ticketId, dto, 'MODIFICACION');
    if (acceso.isFail()) return Result.fail(acceso.getError());

    const ticketSoporte = await this.ticketSoporteRepo.findByTicketId(dto.ticketId);
    if (!ticketSoporte) {
      return Result.fail(new TicketSoporteNoEncontradoError(dto.ticketId));
    }

    ticketSoporte.registrarSolucion(dto.solucion);
    await this.ticketSoporteRepo.save(ticketSoporte);

    return Result.ok(ticketSoporte);
  }
}
