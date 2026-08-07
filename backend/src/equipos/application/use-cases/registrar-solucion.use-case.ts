import { DomainError, Result } from '../../../shared/domain/result';
import { TicketSoporteEntity } from '../../domain/entities/ticket-soporte.entity';
import { ITicketSoporteRepository } from '../../domain/ports/i-ticket-soporte.repository';
import { TicketSoporteNoEncontradoError } from '../../domain/errors/equipos.errors';

/** DTO de entrada para registrar la solución aplicada a un ticket de soporte (F3-Q5). */
export interface RegistrarSolucionDto {
  ticketId: string;
  solucion: string;
}

/**
 * RegistrarSolucionUseCase — registra la solución aplicada a un ticket de
 * soporte (F3-Q5).
 *
 * Flujo:
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
  ) {}

  async execute(dto: RegistrarSolucionDto): Promise<Result<TicketSoporteEntity, DomainError>> {
    const ticketSoporte = await this.ticketSoporteRepo.findByTicketId(dto.ticketId);
    if (!ticketSoporte) {
      return Result.fail(new TicketSoporteNoEncontradoError(dto.ticketId));
    }

    ticketSoporte.registrarSolucion(dto.solucion);
    await this.ticketSoporteRepo.save(ticketSoporte);

    return Result.ok(ticketSoporte);
  }
}
