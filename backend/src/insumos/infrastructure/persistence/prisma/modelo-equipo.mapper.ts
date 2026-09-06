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
   * Incluye `createdAt` para el CREATE; el repo lo excluye del UPDATE.
   *
   * @param entity Modelo de dominio a persistir.
   * @returns El shape de fila que espera Prisma, sin `updatedAt` (lo maneja el ORM).
   */
  static toPersistence(entity: ModeloEquipoEntity): Omit<PrismaModeloEquipo, 'updatedAt'> {
    return {
      id: entity.id,
      marca: entity.marca,
      modelo: entity.modelo,
      activo: entity.activo,
      deletedAt: entity.deletedAt,
      createdAt: entity.createdAt,
    };
  }
}
