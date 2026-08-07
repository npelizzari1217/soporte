/**
 * PrismaSlaTicketWriteRepository — implementación del puerto
 * ISlaTicketWriteRepository. Escritura ACOTADA a `tickets.sla_vence_at`
 * (ADR-P4) — nunca pasa por `PrismaTicketRepository` (Fase 2).
 *
 * Tarea: SA13.
 */
import { Injectable } from '@nestjs/common';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { ISlaTicketWriteRepository } from '../../../domain/ports/i-sla-ticket-write.repository';

@Injectable()
export class PrismaSlaTicketWriteRepository implements ISlaTicketWriteRepository {
  constructor(private readonly tenantContext: TenantContext) {}

  private get client(): InstanceType<typeof TenantPrismaClient> {
    return this.tenantContext.getClient() as InstanceType<typeof TenantPrismaClient>;
  }

  async setSlaVenceAt(ticketId: string, venceAt: Date | null): Promise<void> {
    await this.client.ticket.update({
      where: { id: ticketId },
      data: { slaVenceAt: venceAt },
    });
  }
}
