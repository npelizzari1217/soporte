/**
 * ModeloEquipoMapper — convierte entre Prisma ModeloEquipo (fila de DB) y
 * ModeloEquipoEntity (dominio). Archivo en infrastructure/ — puede importar de
 * '.prisma/tenant'.
 */
import type { ModeloEquipo as PrismaModeloEquipo } from '.prisma/tenant';
import { ModeloEquipoEntity } from '../../../domain/entities/modelo-equipo.entity';

export class ModeloEquipoMapper {
  /**
   * @param row Fila de `modelos_equipo` tal como la devuelve Prisma.
   * @returns La entidad de dominio reconstituida, con timestamps y baja lógica.
   */
  static toDomain(row: PrismaModeloEquipo): ModeloEquipoEntity {
    return ModeloEquipoEntity.reconstitute(
      { marca: row.marca, modelo: row.modelo, activo: row.activo },
      row.id,
      row.createdAt,
      row.updatedAt,
      row.deletedAt ?? null,
    );
  }

  /**
   * SIN `createdAt` — issue #172. `save()` manda este mismo shape en las dos
   * ramas del `upsert` (CREATE y UPDATE): incluirlo traía el reloj del
   * PROCESO (`BaseEntity` lo fija con `new Date()` al construir la entidad,
   * no el de la base) y dejaba sin disparar nunca el
   * `DEFAULT clock_timestamp()` de la columna (ver
   * `prisma_tenant/schema.prisma`, sobre `ModeloEquipo.createdAt`). Omitirlo
   * del todo alcanza para las dos ramas: en el CREATE dispara el `DEFAULT`, y
   * en el UPDATE, al no viajar, no pisa la fecha de alta de un modelo que ya
   * existía.
   *
   * @param entity Modelo de dominio a persistir.
   * @returns El shape de fila que espera Prisma, sin `updatedAt` (lo maneja el ORM) ni `createdAt`.
   */
  static toPersistence(
    entity: ModeloEquipoEntity,
  ): Omit<PrismaModeloEquipo, 'updatedAt' | 'createdAt'> {
    return {
      id: entity.id,
      marca: entity.marca,
      modelo: entity.modelo,
      activo: entity.activo,
      deletedAt: entity.deletedAt,
    };
  }
}
