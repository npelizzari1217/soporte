/**
 * PrismaItemCompraRepository — implementación del puerto IItemCompraRepository.
 *
 * Reglas:
 * - Obtiene el cliente Prisma del tenant activo vía TenantContext.getClient().
 *   NUNCA recibe PrismaService ni llama a PrismaService directamente.
 * - Mapea Prisma rows ↔ ItemCompraEntity vía ItemCompraMapper.
 * - save() es un upsert por id (INSERT si nuevo, UPDATE si existe).
 * - delete() es soft delete: setea deleted_at = now().
 * - findByTicketCompraId() retorna TODOS (incluye soft-deleted).
 * - findActiveByTicketCompraId() retorna solo deleted_at IS NULL.
 *
 * Fitness rule: ningún import de @prisma/client ni .prisma/ fuera de infrastructure/.
 *
 * Tarea: 4.C.2
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

  async findByTicketCompraId(ticketCompraId: string): Promise<ItemCompraEntity[]> {
    // Retorna TODOS los ítems (incluidos soft-deleted) para trazabilidad completa.
    const rows = await this.client.itemCompra.findMany({
      where: { ticketCompraId },
    });
    return rows.map(ItemCompraMapper.toDomain);
  }

  async findActiveByTicketCompraId(ticketCompraId: string): Promise<ItemCompraEntity[]> {
    // Solo ítems con deleted_at IS NULL.
    // Usado por EnviarAAprobacionUseCase para verificar que existe al menos uno.
    const rows = await this.client.itemCompra.findMany({
      where: { ticketCompraId, deletedAt: null },
    });
    return rows.map(ItemCompraMapper.toDomain);
  }

  async save(item: ItemCompraEntity): Promise<void> {
    const data = ItemCompraMapper.toPersistence(item);
    const { id, ...updateData } = data;
    await this.client.itemCompra.upsert({
      where: { id },
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
