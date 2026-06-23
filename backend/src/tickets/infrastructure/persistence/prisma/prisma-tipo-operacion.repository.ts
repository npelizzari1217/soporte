/**
 * PrismaTipoOperacionRepository — implementación del puerto ITipoOperacionRepository.
 *
 * Puerto mínimo: provee findIdByCodigo para que los use cases puedan obtener el UUID
 * del tipo de operación (CAMBIO_ESTADO, ASIGNACION, etc.) antes de crear OperacionTicketEntity.
 *
 * El catálogo es estable y pequeño (5 valores sembrados en provisioning).
 * Podría cachearse en memoria si el volumen de queries lo justifica.
 *
 * Reglas:
 * - Obtiene el cliente via TenantContext (nunca PrismaService directo).
 *
 * Tarea: 3.D.2
 */
import { Injectable } from '@nestjs/common';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { ITipoOperacionRepository } from '../../../domain/ports/i-tipo-operacion.repository';

@Injectable()
export class PrismaTipoOperacionRepository implements ITipoOperacionRepository {
  constructor(private readonly tenantContext: TenantContext) {}

  private get client(): InstanceType<typeof TenantPrismaClient> {
    return this.tenantContext.getClient() as InstanceType<typeof TenantPrismaClient>;
  }

  async findIdByCodigo(codigo: string): Promise<string | null> {
    const row = await this.client.tipoOperacion.findUnique({
      where: { codigo },
      select: { id: true },
    });
    return row?.id ?? null;
  }
}
