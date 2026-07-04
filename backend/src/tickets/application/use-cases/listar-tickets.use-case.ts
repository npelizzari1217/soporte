import { DomainError, Result } from '../../../shared/domain/result';
import { TicketEntity } from '../../domain/entities/ticket.entity';
import { ITicketRepository, TicketFiltros } from '../../domain/ports/i-ticket.repository';
import { ICicloClienteRepository } from '../../domain/ports/i-ciclo-cliente.repository';

/**
 * ListarTicketsUseCase — caso de uso de consulta para todos los tickets del tenant.
 *
 * Fase 4 (ciclos-master-tenant, ADR-5): resuelve el ciclo EFECTIVO internamente
 * — `filtros.cicloId` (histórico) si viene, o el ciclo ACTIVO del tenant por
 * default. Sin cicloId explícito y sin ciclo activo → lista vacía (invariante
 * "siempre por ciclo", nunca "todos"). Esta regla es de negocio, no de HTTP:
 * vive en el use case para que sea testeable en unit sin levantar HTTP.
 *
 * La separación de capas impide que el controller importe directamente puertos
 * de dominio.
 *
 * Ref design: openspec/changes/ciclos-master-tenant/design-fase4.md ADR-5
 * Tarea: feat/tickets-list-mvp, 2.7/2.8 (Fase 4, PR2)
 */
export class ListarTicketsUseCase {
  constructor(
    private readonly ticketRepo: ITicketRepository,
    private readonly cicloClienteRepo: ICicloClienteRepository,
  ) {}

  /**
   * Lista los tickets del tenant aplicando los filtros opcionales.
   *
   * @param filtros - Filtros opcionales (tiposIds, fechaDesde, fechaHasta,
   *   cicloId). Si `filtros.cicloId` no viene, se resuelve el ciclo ACTIVO
   *   del tenant como default. Sin cicloId explícito ni activo → `[]`.
   */
  async execute(filtros?: TicketFiltros): Promise<Result<TicketEntity[], DomainError>> {
    const cicloEfectivo = filtros?.cicloId ?? (await this.cicloClienteRepo.findActive())?.id;

    if (!cicloEfectivo) {
      return Result.ok([]);
    }

    const tickets = await this.ticketRepo.findAll({ ...filtros, cicloId: cicloEfectivo });
    return Result.ok(tickets);
  }
}
