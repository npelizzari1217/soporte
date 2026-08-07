/**
 * PrismaSlaConfigRepository — implementación del puerto ISlaConfigRepository.
 *
 * Reglas:
 * - Obtiene el cliente vía TenantContext (nunca PrismaService directo).
 * - `save()` es upsert por id: INSERT si es nuevo (no debería ocurrir en el
 *   flujo normal, las filas nacen en el seed), UPDATE si ya existe (S1).
 *
 * Tarea: SA7.
 */
import { Injectable } from '@nestjs/common';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { ISlaConfigRepository } from '../../../domain/ports/i-sla-config.repository';
import { SlaConfigEntity } from '../../../domain/entities/sla-config.entity';
import { SlaConfigMapper } from './sla-config.mapper';

@Injectable()
export class PrismaSlaConfigRepository implements ISlaConfigRepository {
  constructor(private readonly tenantContext: TenantContext) {}

  private get client(): InstanceType<typeof TenantPrismaClient> {
    return this.tenantContext.getClient() as InstanceType<typeof TenantPrismaClient>;
  }

  async findById(id: string): Promise<SlaConfigEntity | null> {
    const row = await this.client.slaConfig.findUnique({ where: { id } });
    return row ? SlaConfigMapper.toDomain(row) : null;
  }

  async findByPrioridad(prioridadId: string): Promise<SlaConfigEntity | null> {
    const row = await this.client.slaConfig.findUnique({ where: { prioridadId } });
    return row ? SlaConfigMapper.toDomain(row) : null;
  }

  async findAll(): Promise<SlaConfigEntity[]> {
    const rows = await this.client.slaConfig.findMany({ where: { deletedAt: null } });
    return rows.map(SlaConfigMapper.toDomain);
  }

  async save(config: SlaConfigEntity): Promise<void> {
    const data = SlaConfigMapper.toPersistence(config);
    const { createdAt: _createdAt, ...updateData } = data;
    await this.client.slaConfig.upsert({
      where: { id: data.id },
      create: data,
      update: updateData,
    });
  }
}
