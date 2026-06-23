/**
 * PrismaOperacionTicketRepository — implementación del puerto IOperacionTicketRepository.
 *
 * El timeline es inmutable: solo INSERT. No hay UPDATE ni DELETE de operaciones.
 * El timeline se usa para auditoría y nunca se modifica retroactivamente.
 *
 * Reglas:
 * - Obtiene el cliente via TenantContext (nunca PrismaService directo).
 * - save() solo hace INSERT (no upsert): las operaciones son inmutables.
 * - findByTicketId() excluye operaciones soft-deleted, ordenadas por created_at ASC.
 *
 * Tarea: 3.D.2
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

  async findByTicketId(ticketId: string): Promise<OperacionTicketEntity[]> {
    const rows = await this.client.operacionTicket.findMany({
      where: { ticketId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(OperacionTicketMapper.toDomain);
  }

  async save(operacion: OperacionTicketEntity): Promise<void> {
    // Solo INSERT: el timeline es inmutable.
    // `data as any` necesario por limitación de tipos de Prisma con campos Json? nullable.
    const data = OperacionTicketMapper.toPersistence(operacion);

    await this.client.operacionTicket.create({ data: data as any });
  }
}
