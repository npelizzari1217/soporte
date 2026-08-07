/**
 * PrismaTipoComponenteRepository — implementación del puerto
 * ITipoComponenteRepository. Solo lectura (catálogo read-only, F3-Q3).
 *
 * Tarea: T11.3.
 */
import { Injectable } from '@nestjs/common';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { ITipoComponenteRepository } from '../../../domain/ports/i-tipo-componente.repository';
import { TipoComponenteEntity } from '../../../domain/entities/tipo-componente.entity';
import { TipoComponenteMapper } from './tipo-componente.mapper';

@Injectable()
export class PrismaTipoComponenteRepository implements ITipoComponenteRepository {
  constructor(private readonly tenantContext: TenantContext) {}

  private get client(): InstanceType<typeof TenantPrismaClient> {
    return this.tenantContext.getClient() as InstanceType<typeof TenantPrismaClient>;
  }

  async findById(id: string): Promise<TipoComponenteEntity | null> {
    const row = await this.client.tipoComponente.findUnique({ where: { id } });
    return row ? TipoComponenteMapper.toDomain(row) : null;
  }

  async findByCodigo(codigo: string): Promise<TipoComponenteEntity | null> {
    const row = await this.client.tipoComponente.findUnique({ where: { codigo } });
    return row ? TipoComponenteMapper.toDomain(row) : null;
  }

  async findAllActive(): Promise<TipoComponenteEntity[]> {
    const rows = await this.client.tipoComponente.findMany({
      where: { activo: true, deletedAt: null },
      orderBy: { nombre: 'asc' },
    });
    return rows.map(TipoComponenteMapper.toDomain);
  }
}
