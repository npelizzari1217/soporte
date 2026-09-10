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
   * Incluye `createdAt` para el CREATE; el repo lo excluye del UPDATE.
   *
   * @param entity Familia de dominio a persistir.
   * @returns El shape de fila que espera Prisma, sin `updatedAt` (lo maneja el ORM).
   */
  static toPersistence(entity: FamiliaInsumoEntity): Omit<PrismaFamiliaInsumo, 'updatedAt'> {
    return {
      id: entity.id,
      codigo: entity.codigo,
      nombre: entity.nombre,
      activo: entity.activo,
      esRepuesto: entity.esRepuesto,
      deletedAt: entity.deletedAt,
      createdAt: entity.createdAt,
    };
  }
}
