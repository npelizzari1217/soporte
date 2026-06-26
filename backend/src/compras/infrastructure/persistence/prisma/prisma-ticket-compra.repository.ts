/**
 * PrismaTicketCompraRepository — implementación del puerto ITicketCompraRepository.
 *
 * Reglas:
 * - Obtiene el cliente Prisma del tenant activo vía TenantContext.getClient().
 *   NUNCA recibe PrismaService ni llama a PrismaService directamente.
 * - Mapea Prisma rows ↔ TicketCompraEntity vía TicketCompraMapper.
 * - save() es un upsert por id (INSERT si nuevo, UPDATE si existe).
 * - delete() es soft delete: setea deleted_at = now().
 * - findByTicketId() implementa la relación 1:1 (ticket_id UNIQUE).
 * - findAll() retorna todos los no eliminados, más recientes primero.
 *
 * Fitness rule: ningún import de @prisma/client ni .prisma/ fuera de infrastructure/.
 *
 * Tarea: 4.C.2
 */
import { Injectable } from '@nestjs/common';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { ITicketCompraRepository } from '../../../domain/ports/i-ticket-compra.repository';
import { TicketCompraEntity } from '../../../domain/entities/ticket-compra.entity';
import { TicketCompraMapper } from './ticket-compra.mapper';

@Injectable()
export class PrismaTicketCompraRepository implements ITicketCompraRepository {
  constructor(private readonly tenantContext: TenantContext) {}

  private get client(): InstanceType<typeof TenantPrismaClient> {
    return this.tenantContext.getClient() as InstanceType<typeof TenantPrismaClient>;
  }

  async findByTicketId(ticketId: string): Promise<TicketCompraEntity | null> {
    const row = await this.client.ticketCompra.findUnique({ where: { ticketId } });
    return row ? TicketCompraMapper.toDomain(row) : null;
  }

  async findById(id: string): Promise<TicketCompraEntity | null> {
    const row = await this.client.ticketCompra.findUnique({ where: { id } });
    return row ? TicketCompraMapper.toDomain(row) : null;
  }

  async findAll(): Promise<TicketCompraEntity[]> {
    const rows = await this.client.ticketCompra.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(TicketCompraMapper.toDomain);
  }

  async save(ticketCompra: TicketCompraEntity): Promise<void> {
    const data = TicketCompraMapper.toPersistence(ticketCompra);
    const { id, ...updateData } = data;
    await this.client.ticketCompra.upsert({
      where: { id },
      create: data,
      update: updateData,
    });
  }

  async delete(id: string): Promise<void> {
    await this.client.ticketCompra.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
