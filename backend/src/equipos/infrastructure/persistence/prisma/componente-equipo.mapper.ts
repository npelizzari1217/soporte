/**
 * ComponenteEquipoMapper — convierte entre Prisma ComponenteEquipo y ComponenteEquipoEntity.
 *
 * IMPORTANTE: este archivo SÍ puede importar de '.prisma/tenant' porque está en
 * infrastructure/. La fitness rule (0.A.3) solo prohíbe imports de Prisma fuera de infra.
 *
 * Tarea: 6.C.2
 */
import type { ComponenteEquipo as PrismaComponenteEquipo } from '.prisma/tenant';
import { ComponenteEquipoEntity } from '../../../domain/entities/componente-equipo.entity';

export class ComponenteEquipoMapper {
  /**
   * Convierte una fila de DB Prisma → ComponenteEquipoEntity de dominio.
   */
  static toDomain(row: PrismaComponenteEquipo): ComponenteEquipoEntity {
    return ComponenteEquipoEntity.reconstitute(
      {
        equipoId: row.equipoId,
        tipoComponenteId: row.tipoComponenteId,
        descripcion: row.descripcion ?? null,
        numeroSerie: row.numeroSerie ?? null,
        capacidad: row.capacidad ?? null,
      },
      row.id,
      row.createdAt,
      row.updatedAt,
      row.deletedAt ?? null,
    );
  }

  /**
   * ComponenteEquipoEntity → objeto plano para Prisma upsert.
   * Excluye createdAt y updatedAt (manejados por Prisma @default/@updatedAt).
   */
  static toPersistence(
    entity: ComponenteEquipoEntity,
  ): Omit<PrismaComponenteEquipo, 'createdAt' | 'updatedAt'> {
    return {
      id: entity.id,
      equipoId: entity.equipoId,
      tipoComponenteId: entity.tipoComponenteId,
      descripcion: entity.descripcion,
      numeroSerie: entity.numeroSerie,
      capacidad: entity.capacidad,
      deletedAt: entity.deletedAt,
    };
  }
}
