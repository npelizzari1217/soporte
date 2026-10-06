/**
 * PrismaRelojSlaMarcador — implementa IRelojSlaMarcador (sdd/sla-primera-respuesta-y-pausa, ADR-3).
 *
 * Corre dentro de la tx de la transicion (el `client` del TenantContext es el transaccional): si la tx
 * hace rollback, la version incrementada tambien. `ticket.update` toma el lock de la fila, asi que el
 * `increment` serializa las transiciones concurrentes y la secuencia no repite ni tiene huecos.
 */
import { Injectable } from '@nestjs/common';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { IRelojSlaMarcador } from '../../../domain/ports/i-reloj-sla-marcador';

@Injectable()
export class PrismaRelojSlaMarcador implements IRelojSlaMarcador {
  constructor(private readonly tenantContext: TenantContext) {}

  private get client(): InstanceType<typeof TenantPrismaClient> {
    return this.tenantContext.getClient() as InstanceType<typeof TenantPrismaClient>;
  }

  async marcar(ticketId: string, operacionId: string): Promise<void> {
    const { slaRelojVersion } = await this.client.ticket.update({
      where: { id: ticketId },
      data: { slaRelojVersion: { increment: 1 }, slaRelojPendiente: true },
      select: { slaRelojVersion: true },
    });
    await this.client.operacionTicket.update({
      where: { id: operacionId },
      data: { slaRelojSeq: slaRelojVersion },
    });
  }
}
