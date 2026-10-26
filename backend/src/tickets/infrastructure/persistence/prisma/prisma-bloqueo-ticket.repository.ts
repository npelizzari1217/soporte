import { Injectable } from '@nestjs/common';
import { comprasQueBloquean } from '../../../../reparaciones/domain/services/bloqueo-reparacion';
import { TicketCompraMapper } from '../../../../reparaciones/infrastructure/persistence/prisma/ticket-compra.mapper';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { IBloqueoTicketRepository } from '../../../domain/ports/i-bloqueo-ticket.repository';

/**
 * Bloqueo por compra leído desde `ticket_compra` (odd/ticket-cerrado-solo-lectura, S2;
 * odd/ticket-unificado, S5: vale para cualquier ticket, tenga o no satélite de Edilicia).
 *
 * Reutiliza el mapper y `comprasQueBloquean` de reparaciones para que el criterio sea EL MISMO
 * que el del chip "Bloqueada" del listado: si uno cambia, cambia el otro. Igual que
 * `PrismaTicketCompraRepository`, filtra `compra.deletedAt IS NULL` en la consulta.
 */
@Injectable()
export class PrismaBloqueoTicketRepository implements IBloqueoTicketRepository {
  constructor(private readonly tenantContext: TenantContext) {}

  private get client(): InstanceType<typeof TenantPrismaClient> {
    return this.tenantContext.getClient() as InstanceType<typeof TenantPrismaClient>;
  }

  async estaBloqueadoPorCompra(ticketId: string): Promise<boolean> {
    const rows = await this.client.ticketCompra.findMany({
      where: { ticketId, compra: { deletedAt: null } },
      include: { compra: { include: { items: true } } },
    });
    const vinculadas = rows.map((row) => TicketCompraMapper.toCompraVinculada(row));
    return comprasQueBloquean(vinculadas).length > 0;
  }

  async comprasVinculadas(ticketId: string): Promise<string[]> {
    const rows = await this.client.ticketCompra.findMany({
      where: { ticketId, compra: { deletedAt: null } },
      select: { compra: { select: { numero: true } } },
      orderBy: { compra: { numero: 'asc' } },
    });
    return rows.map((row) => row.compra.numero);
  }

  async generadoPorPlanPreventivo(ticketId: string): Promise<boolean> {
    // `ticket_id` es UNIQUE en `preventivo_generacion`: a lo sumo una fila, por índice.
    const fila = await this.client.preventivoGeneracion.findUnique({
      where: { ticketId },
      select: { id: true },
    });
    return fila !== null;
  }
}
