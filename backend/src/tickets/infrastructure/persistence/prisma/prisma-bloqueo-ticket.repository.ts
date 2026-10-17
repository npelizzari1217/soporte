import { Injectable } from '@nestjs/common';
import { comprasQueBloquean } from '../../../../reparaciones/domain/services/bloqueo-reparacion';
import { ReparacionCompraMapper } from '../../../../reparaciones/infrastructure/persistence/prisma/reparacion-compra.mapper';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { IBloqueoTicketRepository } from '../../../domain/ports/i-bloqueo-ticket.repository';

/**
 * Bloqueo por compra leído desde `reparacion_compra` (odd/ticket-cerrado-solo-lectura, S2).
 *
 * Reutiliza el mapper y `comprasQueBloquean` de reparaciones para que el criterio sea EL MISMO
 * que el del chip "Bloqueada" del listado: si uno cambia, cambia el otro. Igual que
 * `PrismaReparacionCompraRepository`, filtra `compra.deletedAt IS NULL` en la consulta.
 */
@Injectable()
export class PrismaBloqueoTicketRepository implements IBloqueoTicketRepository {
  constructor(private readonly tenantContext: TenantContext) {}

  private get client(): InstanceType<typeof TenantPrismaClient> {
    return this.tenantContext.getClient() as InstanceType<typeof TenantPrismaClient>;
  }

  async estaBloqueadoPorCompra(ticketId: string): Promise<boolean> {
    const rows = await this.client.reparacionCompra.findMany({
      where: { ticketEdilicia: { ticketId }, compra: { deletedAt: null } },
      include: { compra: { include: { items: true } } },
    });
    const vinculadas = rows.map((row) => ReparacionCompraMapper.toCompraVinculada(row));
    return comprasQueBloquean(vinculadas).length > 0;
  }
}
