import { DomainError, Result } from '../../../shared/domain/result';
import { TicketEntity } from '../../../tickets/domain/entities/ticket.entity';
import { ITicketRepository } from '../../../tickets/domain/ports/i-ticket.repository';
import { ItemCompraEntity } from '../../domain/entities/item-compra.entity';
import { PresupuestoEntity } from '../../domain/entities/presupuesto.entity';
import { TicketCompraEntity } from '../../domain/entities/ticket-compra.entity';
import { CompraNoEncontradaError } from '../../domain/errors/compras.errors';
import { ITicketCompraRepository } from '../../domain/ports/i-ticket-compra.repository';
import { IItemCompraRepository } from '../../domain/ports/i-item-compra.repository';
import { IPresupuestoRepository } from '../../domain/ports/i-presupuesto.repository';

/** Detalle completo de un ticket de compra: ticket base + satélite + hijos (sdd/beta-frontend item 1 — G7). */
export interface CompraDetalle {
  ticket: TicketEntity;
  ticketCompra: TicketCompraEntity;
  items: ItemCompraEntity[];
  presupuestos: PresupuestoEntity[];
}

/**
 * ObtenerCompraUseCase — `GET /compras/:id` (sdd/beta-frontend item 1,
 * cierra el gap G7: hasta ahora NO existía forma de recargar
 * items/presupuestos de una compra tras un refresh de página — el frontend
 * los mantenía solo en cache de sesión, poblado por cada mutación exitosa).
 *
 * `:id` = id del `Ticket` BASE (mismo criterio que `aprobar`/`rechazar` en
 * `ComprasController`, y consistente con la ruta `/compras/[id]` ya
 * implementada en el frontend — NO el id del satélite `ticket_compra` como
 * en las rutas anidadas de ítems/presupuestos).
 *
 * Embebe items + presupuestos en la respuesta (decisión: embeber es más
 * simple que 2 GETs dedicados adicionales para una vista de detalle que
 * siempre los necesita juntos).
 */
export class ObtenerCompraUseCase {
  constructor(
    private readonly ticketRepo: Pick<ITicketRepository, 'findById'>,
    private readonly ticketCompraRepo: Pick<ITicketCompraRepository, 'findByTicketId'>,
    private readonly itemCompraRepo: Pick<IItemCompraRepository, 'findActiveByTicketCompraId'>,
    private readonly presupuestoRepo: Pick<IPresupuestoRepository, 'findByTicketCompraId'>,
  ) {}

  async execute(ticketId: string): Promise<Result<CompraDetalle, DomainError>> {
    const ticket = await this.ticketRepo.findById(ticketId);
    if (!ticket || ticket.isDeleted()) {
      return Result.fail(new CompraNoEncontradaError(ticketId));
    }

    const ticketCompra = await this.ticketCompraRepo.findByTicketId(ticketId);
    if (!ticketCompra || ticketCompra.isDeleted()) {
      return Result.fail(new CompraNoEncontradaError(ticketId));
    }

    const [items, presupuestos] = await Promise.all([
      this.itemCompraRepo.findActiveByTicketCompraId(ticketCompra.id),
      this.presupuestoRepo.findByTicketCompraId(ticketCompra.id),
    ]);

    return Result.ok({ ticket, ticketCompra, items, presupuestos });
  }
}
