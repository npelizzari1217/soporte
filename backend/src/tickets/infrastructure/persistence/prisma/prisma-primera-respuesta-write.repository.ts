/**
 * PrismaPrimeraRespuestaWriteRepository — implementa IPrimeraRespuestaWriteRepository
 * (sdd/sla-primera-respuesta-y-pausa, ADR-6).
 *
 * Los dos métodos son `updateMany where { id, primeraRespuestaAt: null }`: la condición viaja en el
 * UPDATE, así que dos comentarios concurrentes dejan la fecha del que llegó primero y una respuesta ya
 * registrada no se pisa. `registrarSiFalta` corre dentro de la tx del comentario (el `client` del
 * TenantContext es el transaccional).
 */
import { Injectable } from '@nestjs/common';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { IPrimeraRespuestaWriteRepository } from '../../../domain/ports/i-primera-respuesta-write.repository';

@Injectable()
export class PrismaPrimeraRespuestaWriteRepository implements IPrimeraRespuestaWriteRepository {
  constructor(private readonly tenantContext: TenantContext) {}

  private get client(): InstanceType<typeof TenantPrismaClient> {
    return this.tenantContext.getClient() as InstanceType<typeof TenantPrismaClient>;
  }

  async registrarSiFalta(ticketId: string, instante: Date): Promise<void> {
    await this.client.ticket.updateMany({
      where: { id: ticketId, primeraRespuestaAt: null },
      data: { primeraRespuestaAt: instante },
    });
  }

  async fijarVencimientoSiSinRespuesta(ticketId: string, venceAt: Date | null): Promise<void> {
    await this.client.ticket.updateMany({
      where: { id: ticketId, primeraRespuestaAt: null },
      data: { primeraRespuestaVenceAt: venceAt },
    });
  }
}
