/**
 * PrismaComponenteEquipoRepository — implementación del puerto
 * IComponenteEquipoRepository.
 *
 * Mismo patrón que PrismaEquipoInformaticoRepository: obtiene el cliente
 * vía TenantContext.getClient(), save() es upsert, delete() es soft delete.
 *
 * Tarea: T11.2.
 */
import { Injectable } from '@nestjs/common';
import { TenantContext } from '../../../../shared/tenancy/tenant-context';
import { TenantPrismaClient } from '../../../../shared/infrastructure/persistence/prisma-clients';
import { IComponenteEquipoRepository } from '../../../domain/ports/i-componente-equipo.repository';
import { ComponenteEquipoEntity } from '../../../domain/entities/componente-equipo.entity';
import { ComponenteEquipoMapper } from './componente-equipo.mapper';

@Injectable()
export class PrismaComponenteEquipoRepository implements IComponenteEquipoRepository {
  constructor(private readonly tenantContext: TenantContext) {}

  private get client(): InstanceType<typeof TenantPrismaClient> {
    return this.tenantContext.getClient() as InstanceType<typeof TenantPrismaClient>;
  }

  async findById(id: string): Promise<ComponenteEquipoEntity | null> {
    const row = await this.client.componenteEquipo.findUnique({ where: { id } });
    return row ? ComponenteEquipoMapper.toDomain(row) : null;
  }

  async findActiveByEquipoId(equipoId: string): Promise<ComponenteEquipoEntity[]> {
    const rows = await this.client.componenteEquipo.findMany({
      where: { equipoId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(ComponenteEquipoMapper.toDomain);
  }

  async save(componente: ComponenteEquipoEntity): Promise<void> {
    const data = ComponenteEquipoMapper.toPersistence(componente);
    const { createdAt: _createdAt, ...updateData } = data;
    await this.client.componenteEquipo.upsert({
      where: { id: data.id },
      create: data,
      update: updateData,
    });
  }

  async delete(id: string): Promise<void> {
    await this.client.componenteEquipo.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
