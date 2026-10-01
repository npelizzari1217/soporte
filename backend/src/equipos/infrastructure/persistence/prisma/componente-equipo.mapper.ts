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

/** Fila de `componentes_equipo` con el serial de su unidad (`include: { unidad: { select: { numeroSerie } } }`). */
export type ComponenteEquipoConUnidad = PrismaComponenteEquipo & {
  unidad?: { numeroSerie: string | null } | null;
};

export class ComponenteEquipoMapper {
  /**
   * Convierte una fila de DB Prisma → ComponenteEquipoEntity de dominio. Con
   * unidad, el `numeroSerie` del componente es el de la unidad (ADR-7): la columna
   * propia es siempre NULL en ese caso.
   */
  static toDomain(row: ComponenteEquipoConUnidad): ComponenteEquipoEntity {
    return ComponenteEquipoEntity.reconstitute(
      {
        equipoId: row.equipoId,
        insumoId: row.insumoId,
        descripcion: row.descripcion ?? null,
        numeroSerie:
          row.unidadId != null ? (row.unidad?.numeroSerie ?? null) : (row.numeroSerie ?? null),
        capacidad: row.capacidad ?? null,
        unidadId: row.unidadId ?? null,
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
   * del UPDATE (nunca pisar el timestamp de creación existente en DB). Con
   * unidad escribe NULL en `numero_serie` (CHECK de la base, ADR-7).
   */
  static toPersistence(entity: ComponenteEquipoEntity): Omit<PrismaComponenteEquipo, 'updatedAt'> {
    return {
      id: entity.id,
      equipoId: entity.equipoId,
      insumoId: entity.insumoId,
      descripcion: entity.descripcion,
      numeroSerie: entity.unidadId != null ? null : entity.numeroSerie,
      capacidad: entity.capacidad,
      unidadId: entity.unidadId,
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
