/**
 * CicloVigenteMapper — convierte entre Prisma CicloVigente y CicloVigenteEntity.
 *
 * Importa de '.prisma/master' solo porque está en infrastructure/ (fitness
 * rule de ESLint lo permite acá exclusivamente).
 *
 * Tarea: T9.6 (PR9 — Ciclos)
 */
import type { CicloVigente as PrismaCicloVigente } from '.prisma/master';
import { CicloVigenteEntity } from '../../../domain/entities/ciclo-vigente.entity';

export class CicloVigenteMapper {
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
