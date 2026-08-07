/**
 * PrismaTicketSoporteRepository — implementación del puerto
 * ITicketSoporteRepository.
 *
 * Tarea: T11.2.
 */
import { Injectable } from '@nestjs/common';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { ITicketSoporteRepository } from '../../../domain/ports/i-ticket-soporte.repository';
import { TicketSoporteEntity } from '../../../domain/entities/ticket-soporte.entity';
import { TicketSoporteMapper } from './ticket-soporte.mapper';

@Injectable()
export class PrismaTicketSoporteRepository implements ITicketSoporteRepository {
  constructor(private readonly tenantContext: TenantContext) {}

  private get client(): InstanceType<typeof TenantPrismaClient> {
    return this.tenantContext.getClient() as InstanceType<typeof TenantPrismaClient>;
  }

  async findById(id: string): Promise<TicketSoporteEntity | null> {
    const row = await this.client.ticketSoporte.findUnique({ where: { id } });
    return row ? TicketSoporteMapper.toDomain(row) : null;
  }

  async findByTicketId(ticketId: string): Promise<TicketSoporteEntity | null> {
    const row = await this.client.ticketSoporte.findUnique({ where: { ticketId } });
    return row ? TicketSoporteMapper.toDomain(row) : null;
  }

  async findByEquipoId(equipoId: string): Promise<TicketSoporteEntity[]> {
    const rows = await this.client.ticketSoporte.findMany({
      where: { equipoId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(TicketSoporteMapper.toDomain);
  }

  async save(ticketSoporte: TicketSoporteEntity): Promise<void> {
    const data = TicketSoporteMapper.toPersistence(ticketSoporte);
    const { createdAt: _createdAt, ...updateData } = data;
    await this.client.ticketSoporte.upsert({
      where: { id: data.id },
      create: data,
      update: updateData,
    });
  }
}
