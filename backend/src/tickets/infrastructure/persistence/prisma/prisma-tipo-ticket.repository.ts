/**
 * PrismaTipoTicketRepository — implementación del puerto ITipoTicketRepository.
 *
 * Puerto mínimo: solo provee findCodigoById para que NumeradorTicket y
 * TicketStateMachineFactory puedan resolver el código del tipo.
 *
 * El catálogo es estable (SOPORTE, COMPRAS, EDILICIA). Podría cachearse
 * si el volumen de queries lo justifica, pero se mantiene simple por ahora.
 *
 * Reglas:
 * - Obtiene el cliente via TenantContext (nunca PrismaService directo).
 *
 * Tarea: 3.D.2
 */
import { Injectable } from '@nestjs/common';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { ITipoTicketRepository } from '../../../domain/ports/i-tipo-ticket.repository';

@Injectable()
export class PrismaTipoTicketRepository implements ITipoTicketRepository {
  constructor(private readonly tenantContext: TenantContext) {}

  private get client(): InstanceType<typeof TenantPrismaClient> {
    return this.tenantContext.getClient() as InstanceType<typeof TenantPrismaClient>;
  }

  async findCodigoById(tipoId: string): Promise<string | null> {
    const row = await this.client.tipoTicket.findUnique({
      where: { id: tipoId },
      select: { codigo: true },
    });
    return row?.codigo ?? null;
  }
}
