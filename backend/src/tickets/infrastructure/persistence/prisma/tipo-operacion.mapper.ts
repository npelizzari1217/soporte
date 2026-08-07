/**
 * TipoOperacionMapper — convierte entre Prisma TipoOperacion (fila de DB) y
 * TipoOperacionEntity (dominio).
 *
 * IMPORTANTE: archivo en infrastructure/ — puede importar de '.prisma/tenant'.
 *
 * Tarea: T2.2
 */
import type { TipoOperacion as PrismaTipoOperacion } from '.prisma/tenant';
import { TipoOperacionEntity } from '../../../domain/entities/tipo-operacion.entity';

export class TipoOperacionMapper {
  /**
   * Convierte una fila de DB Prisma → TipoOperacionEntity de dominio.
   */
  static toDomain(row: PrismaTipoOperacion): TipoOperacionEntity {
    return TipoOperacionEntity.reconstitute(
      {
        codigo: row.codigo,
        nombre: row.nombre,
        activo: row.activo,
      },
      row.id,
      row.createdAt,
      row.updatedAt,
      row.deletedAt ?? null,
    );
  }
}
