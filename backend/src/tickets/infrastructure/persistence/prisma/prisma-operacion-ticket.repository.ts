/**
 * PrismaOperacionTicketRepository — implementación del puerto
 * IOperacionTicketRepository.
 *
 * El timeline es inmutable: solo INSERT. No hay UPDATE de operaciones (la
 * baja excepcional de auditoría, si se necesita, es soft-delete directo en
 * DB — el puerto no lo expone acá).
 *
 * Reglas:
 * - Obtiene el cliente vía TenantContext (nunca PrismaService directo).
 * - save() solo hace INSERT (no upsert).
 * - listByTicket() excluye soft-deleted, ordenado por created_at ASC
 *   (cronológico — T12, T18).
 *
 * Tarea: T5.4
 */
import { Injectable } from '@nestjs/common';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { IOperacionTicketRepository } from '../../../domain/ports/i-operacion-ticket.repository';
import { OperacionTicketEntity } from '../../../domain/entities/operacion-ticket.entity';
import { OperacionTicketMapper } from './operacion-ticket.mapper';

@Injectable()
export class PrismaOperacionTicketRepository implements IOperacionTicketRepository {
  constructor(private readonly tenantContext: TenantContext) {}

  private get client(): InstanceType<typeof TenantPrismaClient> {
    return this.tenantContext.getClient() as InstanceType<typeof TenantPrismaClient>;
  }

  async listByTicket(ticketId: string): Promise<OperacionTicketEntity[]> {
    const rows = await this.client.operacionTicket.findMany({
      where: { ticketId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(OperacionTicketMapper.toDomain);
  }

  /** T10 (PR10) — incluye soft-deleted, mismo criterio que `PrismaTicketRepository.findById`. */
  async findById(id: string): Promise<OperacionTicketEntity | null> {
    const row = await this.client.operacionTicket.findUnique({ where: { id } });
    return row ? OperacionTicketMapper.toDomain(row) : null;
  }

  async save(operacion: OperacionTicketEntity): Promise<void> {
    const data = OperacionTicketMapper.toPersistence(operacion);
    await this.client.operacionTicket.create({ data });
  }
}
