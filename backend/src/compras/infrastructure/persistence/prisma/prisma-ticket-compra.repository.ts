/**
 * PrismaTicketCompraRepository — implementación del puerto
 * ITicketCompraRepository.
 *
 * Reglas:
 * - Obtiene el cliente Prisma del tenant activo vía TenantContext.getClient().
 *   NUNCA recibe PrismaService ni llama a PrismaService directamente.
 * - save() es un upsert por id (INSERT si nuevo, UPDATE si existe); nunca
 *   pisa `createdAt` en el UPDATE (mismo patrón que PrismaTicketRepository).
 *
 * Tarea: T3.2.
 */
import { Injectable } from '@nestjs/common';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import {
  ITicketCompraRepository,
  TicketCompraFiltros,
} from '../../../domain/ports/i-ticket-compra.repository';
import { TicketCompraEntity } from '../../../domain/entities/ticket-compra.entity';
import { TicketCompraMapper } from './ticket-compra.mapper';

@Injectable()
export class PrismaTicketCompraRepository implements ITicketCompraRepository {
  constructor(private readonly tenantContext: TenantContext) {}

  private get client(): InstanceType<typeof TenantPrismaClient> {
    return this.tenantContext.getClient() as InstanceType<typeof TenantPrismaClient>;
  }

  async findById(id: string): Promise<TicketCompraEntity | null> {
    const row = await this.client.ticketCompra.findUnique({ where: { id } });
    return row ? TicketCompraMapper.toDomain(row) : null;
  }

  async findByTicketId(ticketId: string): Promise<TicketCompraEntity | null> {
    const row = await this.client.ticketCompra.findUnique({ where: { ticketId } });
    return row ? TicketCompraMapper.toDomain(row) : null;
  }

  /**
   * `filtros.cicloId` no se pushdown-ea a la query: `ticket_compra` no
   * tiene `ciclo_id` propio (vive en el `Ticket` base). Se acepta en la
   * firma del puerto para uso futuro del caller (join en memoria, mismo
   * patrón que `ListarComprasUseCase`); actualmente `findAll()` retorna
   * todos los `ticket_compra` activos del tenant.
   */
  async findAll(_filtros?: TicketCompraFiltros): Promise<TicketCompraEntity[]> {
    const rows = await this.client.ticketCompra.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(TicketCompraMapper.toDomain);
  }

  async save(ticketCompra: TicketCompraEntity): Promise<void> {
    const data = TicketCompraMapper.toPersistence(ticketCompra);
    const { createdAt: _createdAt, ...updateData } = data;
    await this.client.ticketCompra.upsert({
      where: { id: data.id },
      create: data,
      update: updateData,
    });
  }
}
