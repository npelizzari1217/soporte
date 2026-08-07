/**
 * PrismaSlaTicketQueryRepository — implementación del puerto
 * ISlaTicketQueryRepository (S4). Lectura/marcado ACOTADO a las columnas SLA
 * de `tickets` (ADR-P4) — nunca pasa por `PrismaTicketRepository` (Fase 2).
 *
 * Tarea: SB4.
 */
import { Injectable } from '@nestjs/common';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import {
  ISlaTicketQueryRepository,
  TicketVencible,
} from '../../../domain/ports/i-sla-ticket-query.repository';

/**
 * Estados excluidos del barrido de vencimiento (S4) — un ticket en
 * RESUELTO/CERRADO/CANCELADO nunca se marca `vencido`, aunque su
 * `sla_vence_at` haya pasado.
 */
const ESTADOS_EXCLUIDOS_VENCIMIENTO = ['RESUELTO', 'CERRADO', 'CANCELADO'];

@Injectable()
export class PrismaSlaTicketQueryRepository implements ISlaTicketQueryRepository {
  constructor(private readonly tenantContext: TenantContext) {}

  private get client(): InstanceType<typeof TenantPrismaClient> {
    return this.tenantContext.getClient() as InstanceType<typeof TenantPrismaClient>;
  }

  async findVencibles(now: Date): Promise<TicketVencible[]> {
    const rows = await this.client.ticket.findMany({
      where: {
        slaVenceAt: { lt: now },
        vencido: false,
        deletedAt: null,
        estado: { codigo: { notIn: ESTADOS_EXCLUIDOS_VENCIMIENTO } },
      },
      select: { id: true, asignadoId: true, solicitanteId: true },
    });
    return rows;
  }

  /**
   * Idempotente: el `WHERE vencido: false` evita re-marcar (y re-contar) un
   * ticket que ya fue marcado por una corrida anterior del barrido (S4).
   */
  async marcarVencido(ticketId: string): Promise<void> {
    await this.client.ticket.updateMany({
      where: { id: ticketId, vencido: false },
      data: { vencido: true },
    });
  }
}
