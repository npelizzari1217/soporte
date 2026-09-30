/**
 * UnidadMedidaMapper — convierte entre Prisma UnidadMedida (fila de DB) y
 * UnidadMedidaEntity (dominio). Archivo en infrastructure/ — puede importar de
 * '.prisma/tenant'.
 */
import type { UnidadMedida as PrismaUnidadMedida } from '.prisma/tenant';
import { UnidadMedidaEntity } from '../../../domain/entities/unidad-medida.entity';

export class UnidadMedidaMapper {
  /**
   * @param row Fila de `unidades_medida` tal como la devuelve Prisma.
   * @returns La entidad de dominio reconstituida, con timestamps y baja lógica.
   */
  static toDomain(row: PrismaUnidadMedida): UnidadMedidaEntity {
    return UnidadMedidaEntity.reconstitute(
      { codigo: row.codigo, nombre: row.nombre, activo: row.activo },
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
   * `prisma_tenant/schema.prisma`, sobre `UnidadMedida.createdAt`). Omitirlo
   * del todo alcanza para las dos ramas: en el CREATE dispara el `DEFAULT`, y
   * en el UPDATE, al no viajar, no pisa la fecha de alta de una unidad que ya
   * existía.
   *
   * @param entity Unidad de dominio a persistir.
   * @returns El shape de fila que espera Prisma, sin `updatedAt` (lo maneja el ORM) ni `createdAt`.
   */
  static toPersistence(
    entity: UnidadMedidaEntity,
  ): Omit<PrismaUnidadMedida, 'updatedAt' | 'createdAt' | 'entera'> {
    return {
      id: entity.id,
      codigo: entity.codigo,
      nombre: entity.nombre,
      activo: entity.activo,
      deletedAt: entity.deletedAt,
    };
  }
}
