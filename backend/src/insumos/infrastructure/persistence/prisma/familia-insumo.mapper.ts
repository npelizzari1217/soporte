/**
 * FamiliaInsumoMapper — convierte entre Prisma FamiliaInsumo (fila de DB) y
 * FamiliaInsumoEntity (dominio). Archivo en infrastructure/ — puede importar de
 * '.prisma/tenant'.
 */
import type { FamiliaInsumo as PrismaFamiliaInsumo } from '.prisma/tenant';
import { FamiliaInsumoEntity } from '../../../domain/entities/familia-insumo.entity';

export class FamiliaInsumoMapper {
  /**
   * @param row Fila de `familias_insumo` tal como la devuelve Prisma.
   * @returns La entidad de dominio reconstituida, con timestamps y baja lógica.
   */
  static toDomain(row: PrismaFamiliaInsumo): FamiliaInsumoEntity {
    return FamiliaInsumoEntity.reconstitute(
      { codigo: row.codigo, nombre: row.nombre, activo: row.activo, esRepuesto: row.esRepuesto },
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
   * `prisma_tenant/schema.prisma`, sobre `FamiliaInsumo.createdAt`).
   * Omitirlo del todo alcanza para las dos ramas: en el CREATE dispara el
   * `DEFAULT`, y en el UPDATE, al no viajar, no pisa la fecha de alta de una
   * familia que ya existía.
   *
   * @param entity Familia de dominio a persistir.
   * @returns El shape de fila que espera Prisma, sin `updatedAt` (lo maneja el ORM) ni `createdAt`.
   */
  static toPersistence(
    entity: FamiliaInsumoEntity,
  ): Omit<PrismaFamiliaInsumo, 'updatedAt' | 'createdAt'> {
    return {
      id: entity.id,
      codigo: entity.codigo,
      nombre: entity.nombre,
      activo: entity.activo,
      esRepuesto: entity.esRepuesto,
      deletedAt: entity.deletedAt,
    };
  }
}
