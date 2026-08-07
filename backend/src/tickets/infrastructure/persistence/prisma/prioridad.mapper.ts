/**
 * PrioridadMapper — convierte entre Prisma Prioridad (fila de DB) y
 * PrioridadEntity (dominio).
 *
 * IMPORTANTE: archivo en infrastructure/ — puede importar de '.prisma/tenant'.
 *
 * Tarea: T2.2
 */
import type { Prioridad as PrismaPrioridad } from '.prisma/tenant';
import { PrioridadEntity } from '../../../domain/entities/prioridad.entity';

export class PrioridadMapper {
  /**
   * Convierte una fila de DB Prisma → PrioridadEntity de dominio.
   */
  static toDomain(row: PrismaPrioridad): PrioridadEntity {
    return PrioridadEntity.reconstitute(
      {
        codigo: row.codigo,
        nombre: row.nombre,
        color: row.color ?? null,
        orden: row.orden,
        activo: row.activo,
      },
      row.id,
      row.createdAt,
      row.updatedAt,
      row.deletedAt ?? null,
    );
  }

  /**
   * Convierte PrioridadEntity → objeto plano para Prisma upsert (T11.2,
   * PR11). Incluye `createdAt` para que el repo lo use en el CREATE y lo
   * excluya del UPDATE (nunca pisar el timestamp de creación existente).
   */
  static toPersistence(entity: PrioridadEntity): Omit<PrismaPrioridad, 'updatedAt'> {
    return {
      id: entity.id,
      codigo: entity.codigo,
      nombre: entity.nombre,
      color: entity.color,
      orden: entity.orden,
      activo: entity.activo,
      deletedAt: entity.deletedAt,
      createdAt: entity.createdAt,
    };
  }
}
