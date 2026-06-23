/**
 * PrismaTicketSoporteRepository — implementación del puerto ITicketSoporteRepository.
 *
 * Reglas:
 * - Obtiene el cliente Prisma del tenant activo vía TenantContext.getClient().
 *   NUNCA recibe PrismaService ni llama a PrismaService directamente.
 * - Mapea Prisma rows ↔ TicketSoporteEntity vía TicketSoporteMapper.
 * - save() es un upsert por id. La relación 1:1 (UNIQUE en ticket_id) la garantiza la DB.
 * - delete() es soft delete: setea deleted_at = now().
 * - findByEquipoId() retorna solo registros con deleted_at IS NULL.
 *
 * Fitness rule: ningún import de @prisma/client ni .prisma/ fuera de infrastructure/.
 *
 * Tarea: 6.C.2
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

  async findByTicketId(ticketId: string): Promise<TicketSoporteEntity | null> {
    const row = await this.client.ticketSoporte.findUnique({ where: { ticketId } });
    return row ? TicketSoporteMapper.toDomain(row) : null;
  }

  async findById(id: string): Promise<TicketSoporteEntity | null> {
    const row = await this.client.ticketSoporte.findUnique({ where: { id } });
    return row ? TicketSoporteMapper.toDomain(row) : null;
  }

  async findByEquipoId(equipoId: string): Promise<TicketSoporteEntity[]> {
    // Excluye soft-deleted: solo tickets_soporte con deleted_at IS NULL.
    const rows = await this.client.ticketSoporte.findMany({
      where: { equipoId, deletedAt: null },
    });
    return rows.map(TicketSoporteMapper.toDomain);
  }

  async save(ticketSoporte: TicketSoporteEntity): Promise<void> {
    const data = TicketSoporteMapper.toPersistence(ticketSoporte);
    const { id, ...updateData } = data;
    await this.client.ticketSoporte.upsert({
      where: { id },
      create: data,
      update: updateData,
    });
  }

  async delete(id: string): Promise<void> {
    await this.client.ticketSoporte.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
