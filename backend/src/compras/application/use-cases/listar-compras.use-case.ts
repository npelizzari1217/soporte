import { DomainError, Result } from '../../../shared/domain/result';
import { TicketEntity } from '../../../tickets/domain/entities/ticket.entity';
import { TicketCompraEntity } from '../../domain/entities/ticket-compra.entity';
import { ITicketCompraRepository } from '../../domain/ports/i-ticket-compra.repository';
import { ITicketRepository } from '../../../tickets/domain/ports/i-ticket.repository';
import { ICicloClienteRepository } from '../../../tickets/domain/ports/i-ciclo-cliente.repository';

/**
 * ListarComprasUseCase — caso de uso de consulta para los tickets de compra
 * del ciclo de gestión del tenant.
 *
 * Obtiene todos los TicketCompraEntity del tenant, resuelve el ticket base de
 * cada uno vía ITicketRepository.findById(ticketId), y filtra por ciclo
 * (Fase 4, ciclos-master-tenant, ADR-5):
 * - `execute()` (sin cicloId): usa el ciclo ACTIVO del tenant.
 * - `execute(cicloId)`: filtra por ese ciclo puntual (histórico), ignorando el activo.
 * - Sin ciclo activo ni cicloId explícito: no hay ciclo efectivo → `Result.ok([])`
 *   SIN llamar a `findAll()` (evita traer datos que de todos modos se descartarían).
 *
 * El filtro compara `ticket.cicloId` (el satélite `ticket_compra` no tiene ciclo
 * propio) contra el ciclo efectivo, en memoria — no hay push-down a la query de
 * `ticket_compra` porque el listado de compras siempre resuelve el ticket base
 * de todos modos.
 *
 * Los satélites sin ticket base asociado (registros huérfanos) se omiten
 * silenciosamente.
 *
 * Ref design: openspec/changes/ciclos-master-tenant/design-fase4.md ADR-5
 * Tarea: feat/tickets-list-mvp; 3.6 (Fase 4, PR3)
 */
export interface CompraConTicket {
  ticket: TicketEntity;
  ticketCompra: TicketCompraEntity;
}

export class ListarComprasUseCase {
  constructor(
    private readonly ticketCompraRepo: ITicketCompraRepository,
    private readonly ticketRepo: ITicketRepository,
    private readonly cicloRepo: Pick<ICicloClienteRepository, 'findActive'>,
  ) {}

  async execute(cicloId?: string): Promise<Result<CompraConTicket[], DomainError>> {
    // Ciclo efectivo: el pedido explícitamente (histórico) o el ACTIVO del tenant.
    const cicloEfectivo = cicloId ?? (await this.cicloRepo.findActive())?.id;
    if (!cicloEfectivo) {
      return Result.ok([]);
    }

    const compras = await this.ticketCompraRepo.findAll();
    const items: CompraConTicket[] = [];

    for (const ticketCompra of compras) {
      const ticket = await this.ticketRepo.findById(ticketCompra.ticketId);
      if (ticket && ticket.cicloId === cicloEfectivo) {
        items.push({ ticket, ticketCompra });
      }
    }

    return Result.ok(items);
  }
}
