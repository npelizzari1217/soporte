/**
 * PrismaSlaTicketQueryRepository — implementación del puerto
 * ISlaTicketQueryRepository (S4). Lectura/marcado ACOTADO a las columnas SLA
 * de `tickets` (ADR-P4) — nunca pasa por `PrismaTicketRepository` (Fase 2).
 *
 * Tarea: SB4.
 */
import { Injectable } from '@nestjs/common';
import { ESTADOS_RELOJ_CORRE } from '../../../../tickets/domain/state-machine/estados.constants';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import {
  ISlaTicketQueryRepository,
  TicketVencible,
} from '../../../domain/ports/i-sla-ticket-query.repository';

/**
 * Un ticket solo vence con el reloj corriendo (fuente única `ESTADOS_RELOJ_CORRE`, no una lista NOT IN)
 * y sin reloj pendiente de reconciliar: con un `slaVenceAt` viejo marcaría a un ticket recién reanudado.
 */
const SOLO_CON_RELOJ_CORRIENDO = {
  slaRelojPendiente: false,
  estado: { codigo: { in: [...ESTADOS_RELOJ_CORRE] } },
};

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
        ...SOLO_CON_RELOJ_CORRIENDO,
      },
      select: { id: true, asignadoId: true, solicitanteId: true },
    });
    return rows;
  }

  /**
   * Idempotente: el `WHERE vencido: false` evita re-marcar (y re-contar) un
   * ticket que ya fue marcado por una corrida anterior del barrido (S4).
   */
  async marcarVencido(ticketId: string): Promise<boolean> {
    const { count } = await this.client.ticket.updateMany({
      where: { id: ticketId, vencido: false, ...SOLO_CON_RELOJ_CORRIENDO },
      data: { vencido: true },
    });
    return count === 1;
  }
}
