/**
 * PrismaComponenteEquipoRepository — implementación del puerto IComponenteEquipoRepository.
 *
 * Reglas:
 * - Obtiene el cliente Prisma del tenant activo vía TenantContext.getClient().
 *   NUNCA recibe PrismaService ni llama a PrismaService directamente.
 * - Mapea Prisma rows ↔ ComponenteEquipoEntity vía ComponenteEquipoMapper.
 * - save() es un upsert por id.
 * - delete() es soft delete: setea deleted_at = now().
 * - findByEquipoId() retorna solo componentes con deleted_at IS NULL.
 *
 * Fitness rule: ningún import de @prisma/client ni .prisma/ fuera de infrastructure/.
 *
 * Tarea: 6.C.2
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

  async findByEquipoId(equipoId: string): Promise<ComponenteEquipoEntity[]> {
    // Excluye soft-deleted: solo componentes con deleted_at IS NULL.
    const rows = await this.client.componenteEquipo.findMany({
      where: { equipoId, deletedAt: null },
    });
    return rows.map(ComponenteEquipoMapper.toDomain);
  }

  async save(componente: ComponenteEquipoEntity): Promise<void> {
    const data = ComponenteEquipoMapper.toPersistence(componente);
    const { id, ...updateData } = data;
    await this.client.componenteEquipo.upsert({
      where: { id },
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
