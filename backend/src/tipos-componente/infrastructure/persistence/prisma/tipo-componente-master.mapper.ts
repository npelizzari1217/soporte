/**
 * TipoComponenteMasterMapper — convierte entre el modelo Prisma
 * `TipoComponente` (prisma_master) y la entidad de dominio `TipoComponente`.
 *
 * Importa de '.prisma/master' solo porque está en infrastructure/ (fitness
 * rule de ESLint lo permite acá exclusivamente).
 */
import type { TipoComponente as PrismaTipoComponente } from '.prisma/master';
import { TipoComponente } from '../../../domain/entities/tipo-componente.entity';

export class TipoComponenteMasterMapper {
  static toDomain(row: PrismaTipoComponente): TipoComponente {
    return TipoComponente.reconstitute(
      {
        codigo: row.codigo,
        nombre: row.nombre,
        activo: row.activo,
      },
      row.id,
      row.createdAt,
      row.updatedAt,
    );
  }

  static toPersistence(
    entity: TipoComponente,
  ): Omit<PrismaTipoComponente, 'createdAt' | 'updatedAt'> {
    return {
      id: entity.id,
      codigo: entity.codigo,
      nombre: entity.nombre,
      activo: entity.activo,
    };
  }
}
