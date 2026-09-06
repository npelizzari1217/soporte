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
   * Incluye `createdAt` para el CREATE; el repo lo excluye del UPDATE.
   *
   * @param entity Unidad de dominio a persistir.
   * @returns El shape de fila que espera Prisma, sin `updatedAt` (lo maneja el ORM).
   */
  static toPersistence(entity: UnidadMedidaEntity): Omit<PrismaUnidadMedida, 'updatedAt'> {
    return {
      id: entity.id,
      codigo: entity.codigo,
      nombre: entity.nombre,
      activo: entity.activo,
      deletedAt: entity.deletedAt,
      createdAt: entity.createdAt,
    };
  }
}
