/**
 * ComponenteEquipoMapper — convierte entre Prisma ComponenteEquipo (fila de
 * DB) y ComponenteEquipoEntity (dominio).
 *
 * IMPORTANTE: archivo en infrastructure/ — puede importar de '.prisma/tenant'.
 *
 * Sin tipo: la columna `tipo_componente_codigo` se retiró del esquema tenant
 * (sdd/catalogo-unico-componentes); el tipo se deriva de la familia del insumo.
 *
 * Tarea: T11.2.
 */
import type { ComponenteEquipo as PrismaComponenteEquipo } from '.prisma/tenant';
import {
  ComponenteEquipoEntity,
  DestinoRetiroComponente,
} from '../../../domain/entities/componente-equipo.entity';

export class ComponenteEquipoMapper {
  /** Convierte una fila de DB Prisma → ComponenteEquipoEntity de dominio. */
  static toDomain(row: PrismaComponenteEquipo): ComponenteEquipoEntity {
    return ComponenteEquipoEntity.reconstitute(
      {
        equipoId: row.equipoId,
        insumoId: row.insumoId,
        descripcion: row.descripcion ?? null,
        numeroSerie: row.numeroSerie ?? null,
        capacidad: row.capacidad ?? null,
        instalacionMovimientoId: row.instalacionMovimientoId ?? null,
        // El CHECK de la base garantiza el catálogo; el cast es del tipo, no una validación.
        bajaDestino: (row.bajaDestino as DestinoRetiroComponente | null) ?? null,
        bajaMotivo: row.bajaMotivo ?? null,
        bajaMovimientoId: row.bajaMovimientoId ?? null,
        bajaUsuarioId: row.bajaUsuarioId ?? null,
      },
      row.id,
      row.createdAt,
      row.updatedAt,
      row.deletedAt ?? null,
    );
  }

  /**
   * Convierte ComponenteEquipoEntity → objeto plano para Prisma upsert.
   * Incluye `createdAt` para que el repo lo use en el CREATE y lo excluya
   * del UPDATE (nunca pisar el timestamp de creación existente en DB).
   */
  static toPersistence(
    entity: ComponenteEquipoEntity,
  ): Omit<PrismaComponenteEquipo, 'updatedAt' | 'unidadId'> {
    return {
      id: entity.id,
      equipoId: entity.equipoId,
      insumoId: entity.insumoId,
      descripcion: entity.descripcion,
      numeroSerie: entity.numeroSerie,
      capacidad: entity.capacidad,
      instalacionMovimientoId: entity.instalacionMovimientoId,
      bajaDestino: entity.bajaDestino,
      bajaMotivo: entity.bajaMotivo,
      bajaMovimientoId: entity.bajaMovimientoId,
      bajaUsuarioId: entity.bajaUsuarioId,
      deletedAt: entity.deletedAt,
      createdAt: entity.createdAt,
    };
  }
}
