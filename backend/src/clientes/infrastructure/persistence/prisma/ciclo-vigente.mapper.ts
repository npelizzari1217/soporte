/**
 * CicloVigenteMapper — convierte entre PrismaCicloVigente (row) y CicloVigenteEntity.
 *
 * En infrastructure/ → puede importar de '.prisma/master'.
 *
 * Tarea: 1.C.2
 */
import type { CicloVigente as PrismaCicloVigente } from '.prisma/master';
import { CicloVigenteEntity } from '../../../domain/entities/ciclo-vigente.entity';

export class CicloVigenteMapper {
  /**
   * Convierte PrismaCicloVigente → CicloVigenteEntity.
   * Usa reconstitute() para hidratar timestamps de la DB.
   */
  static toDomain(row: PrismaCicloVigente): CicloVigenteEntity {
    return CicloVigenteEntity.reconstitute(
      {
        nombre: row.nombre,
        fechaInicio: row.fechaInicio,
        fechaFin: row.fechaFin,
        activo: row.activo,
      },
      row.id,
      row.createdAt,
      row.updatedAt,
      row.deletedAt ?? null,
    );
  }

  /**
   * Convierte CicloVigenteEntity → objeto plano para Prisma upsert.
   */
  static toPersistence(
    entity: CicloVigenteEntity,
  ): Omit<PrismaCicloVigente, 'createdAt' | 'updatedAt'> {
    return {
      id: entity.id,
      nombre: entity.nombre,
      fechaInicio: entity.fechaInicio,
      fechaFin: entity.fechaFin,
      activo: entity.activo,
      deletedAt: entity.deletedAt,
    };
  }
}
