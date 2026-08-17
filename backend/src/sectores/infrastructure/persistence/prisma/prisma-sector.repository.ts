/**
 * PrismaSectorRepository — implementación del puerto ISectorRepository
 * (WU-05). Obtiene el cliente vía TenantContext (nunca PrismaService
 * directo). `findAllActive()` excluye sectores soft-deleted.
 */
import { Injectable } from '@nestjs/common';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { ISectorRepository } from '../../../domain/ports/i-sector.repository';
import { SectorEntity } from '../../../domain/entities/sector.entity';
import { SectorMapper } from './sector.mapper';

@Injectable()
export class PrismaSectorRepository implements ISectorRepository {
  constructor(private readonly tenantContext: TenantContext) {}

  private get client(): InstanceType<typeof TenantPrismaClient> {
    return this.tenantContext.getClient() as InstanceType<typeof TenantPrismaClient>;
  }

  async findById(id: string): Promise<SectorEntity | null> {
    const row = await this.client.sector.findUnique({ where: { id } });
    return row ? SectorMapper.toDomain(row) : null;
  }

  async findByCodigo(codigo: string): Promise<SectorEntity | null> {
    const row = await this.client.sector.findUnique({ where: { codigo } });
    return row ? SectorMapper.toDomain(row) : null;
  }

  async findAllActive(): Promise<SectorEntity[]> {
    const rows = await this.client.sector.findMany({
      where: { deletedAt: null },
      orderBy: { codigo: 'asc' },
    });
    return rows.map(SectorMapper.toDomain);
  }

  /** Upsert por id: INSERT si es nuevo, UPDATE si existe. Nunca pisa `createdAt` en el UPDATE. */
  async save(sector: SectorEntity): Promise<void> {
    const data = SectorMapper.toPersistence(sector);
    const { createdAt: _createdAt, ...updateData } = data;
    await this.client.sector.upsert({
      where: { id: data.id },
      create: data,
      update: updateData,
    });
  }
}
