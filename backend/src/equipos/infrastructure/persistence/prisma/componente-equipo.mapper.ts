/**
 * ComponenteEquipoMapper — convierte entre Prisma ComponenteEquipo (fila de
 * DB) y ComponenteEquipoEntity (dominio).
 *
 * IMPORTANTE: archivo en infrastructure/ — puede importar de '.prisma/tenant'.
 *
 * PR4b (sdd/tipos-componente-master, contract): el dominio pasa a manejar
 * `tipoComponenteCodigo` — se quita `tipoComponenteId` (columna/relación
 * eliminadas del schema tenant en este mismo PR).
 *
 * Tarea: T11.2.
 */
import type { ComponenteEquipo as PrismaComponenteEquipo } from '.prisma/tenant';
import { ComponenteEquipoEntity } from '../../../domain/entities/componente-equipo.entity';

export class ComponenteEquipoMapper {
  /** Convierte una fila de DB Prisma → ComponenteEquipoEntity de dominio. */
  static toDomain(row: PrismaComponenteEquipo): ComponenteEquipoEntity {
    return ComponenteEquipoEntity.reconstitute(
      {
        equipoId: row.equipoId,
        tipoComponenteCodigo: row.tipoComponenteCodigo,
        insumoId: row.insumoId ?? null,
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
   * Convierte ComponenteEquipoEntity → objeto plano para Prisma upsert.
   * Incluye `createdAt` para que el repo lo use en el CREATE y lo excluya
   * del UPDATE (nunca pisar el timestamp de creación existente en DB).
   */
  static toPersistence(entity: ComponenteEquipoEntity): Omit<PrismaComponenteEquipo, 'updatedAt'> {
    return {
      id: entity.id,
      equipoId: entity.equipoId,
      tipoComponenteCodigo: entity.tipoComponenteCodigo,
      insumoId: entity.insumoId,
      descripcion: entity.descripcion,
      numeroSerie: entity.numeroSerie,
      capacidad: entity.capacidad,
      deletedAt: entity.deletedAt,
      createdAt: entity.createdAt,
    };
  }
}
