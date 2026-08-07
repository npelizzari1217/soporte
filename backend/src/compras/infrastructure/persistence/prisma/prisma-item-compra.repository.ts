/**
 * PrismaItemCompraRepository — implementación del puerto
 * IItemCompraRepository.
 *
 * Tarea: T3.2.
 */
import { Injectable } from '@nestjs/common';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { IItemCompraRepository } from '../../../domain/ports/i-item-compra.repository';
import { ItemCompraEntity } from '../../../domain/entities/item-compra.entity';
import { ItemCompraMapper } from './item-compra.mapper';

@Injectable()
export class PrismaItemCompraRepository implements IItemCompraRepository {
  constructor(private readonly tenantContext: TenantContext) {}

  private get client(): InstanceType<typeof TenantPrismaClient> {
    return this.tenantContext.getClient() as InstanceType<typeof TenantPrismaClient>;
  }

  async findById(id: string): Promise<ItemCompraEntity | null> {
    const row = await this.client.itemCompra.findUnique({ where: { id } });
    return row ? ItemCompraMapper.toDomain(row) : null;
  }

  async findActiveByTicketCompraId(ticketCompraId: string): Promise<ItemCompraEntity[]> {
    const rows = await this.client.itemCompra.findMany({
      where: { ticketCompraId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(ItemCompraMapper.toDomain);
  }

  async save(item: ItemCompraEntity): Promise<void> {
    const data = ItemCompraMapper.toPersistence(item);
    const { createdAt: _createdAt, ...updateData } = data;
    await this.client.itemCompra.upsert({
      where: { id: data.id },
      create: data,
      update: updateData,
    });
  }

  async delete(id: string): Promise<void> {
    await this.client.itemCompra.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
