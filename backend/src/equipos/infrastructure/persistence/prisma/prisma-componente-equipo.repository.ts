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

/** El serial del componente con unidad vive en la unidad (ADR-7): toda lectura lo resuelve. */
const INCLUIR_UNIDAD = { unidad: { select: { numeroSerie: true } } } as const;

@Injectable()
export class PrismaComponenteEquipoRepository implements IComponenteEquipoRepository {
  constructor(private readonly tenantContext: TenantContext) {}

  private get client(): InstanceType<typeof TenantPrismaClient> {
    return this.tenantContext.getClient() as InstanceType<typeof TenantPrismaClient>;
  }

  async findById(id: string): Promise<ComponenteEquipoEntity | null> {
    const row = await this.client.componenteEquipo.findUnique({
      where: { id },
      include: INCLUIR_UNIDAD,
    });
    return row ? ComponenteEquipoMapper.toDomain(row) : null;
  }

  async findActiveByEquipoId(equipoId: string): Promise<ComponenteEquipoEntity[]> {
    const rows = await this.client.componenteEquipo.findMany({
      where: { equipoId, deletedAt: null },
      include: INCLUIR_UNIDAD,
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(ComponenteEquipoMapper.toDomain);
  }

  async findAllByEquipoId(equipoId: string): Promise<ComponenteEquipoEntity[]> {
    const rows = await this.client.componenteEquipo.findMany({
      where: { equipoId },
      include: INCLUIR_UNIDAD,
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

  async editar(componente: ComponenteEquipoEntity): Promise<boolean> {
    const { count } = await this.client.componenteEquipo.updateMany({
      where: { id: componente.id, deletedAt: null },
      data: {
        descripcion: componente.descripcion,
        // Con unidad el serial es el de la unidad: la columna queda NULL (CHECK
        // `componentes_equipo_unidad_sin_serie_texto_check`, mismo criterio que el mapper).
        numeroSerie: componente.unidadId != null ? null : componente.numeroSerie,
        capacidad: componente.capacidad,
        updatedAt: new Date(),
      },
    });
    return count > 0;
  }

  async retirar(componente: ComponenteEquipoEntity): Promise<boolean> {
    const { count } = await this.client.componenteEquipo.updateMany({
      where: { id: componente.id, deletedAt: null },
      data: {
        deletedAt: componente.deletedAt,
        bajaDestino: componente.bajaDestino,
        bajaMotivo: componente.bajaMotivo,
        bajaMovimientoId: componente.bajaMovimientoId,
        bajaUsuarioId: componente.bajaUsuarioId,
      },
    });
    return count > 0;
  }

  async reactivar(componente: ComponenteEquipoEntity): Promise<boolean> {
    const { count } = await this.client.componenteEquipo.updateMany({
      where: {
        id: componente.id,
        deletedAt: { not: null },
        // `NOT (baja_destino = 'STOCK_USADO')` descartaría las filas con NULL: se listan los
        // destinos que sí admiten reactivar.
        OR: [{ bajaDestino: null }, { bajaDestino: 'DESCARTE' }],
      },
      data: {
        deletedAt: null,
        bajaDestino: null,
        bajaMotivo: null,
        bajaMovimientoId: null,
        bajaUsuarioId: null,
        updatedAt: new Date(),
      },
    });
    return count > 0;
  }
}
