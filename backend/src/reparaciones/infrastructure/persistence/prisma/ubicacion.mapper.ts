/**
 * UbicacionMapper — convierte entre Prisma Ubicacion (fila de DB) y
 * UbicacionEntity (dominio).
 *
 * IMPORTANTE: archivo en infrastructure/ — puede importar de '.prisma/tenant'.
 *
 * Tarea: T7.2.
 */
import type { Ubicacion as PrismaUbicacion } from '.prisma/tenant';
import { UbicacionEntity } from '../../../domain/entities/ubicacion.entity';

export class UbicacionMapper {
  /** Convierte una fila de DB Prisma → UbicacionEntity de dominio. */
  static toDomain(row: PrismaUbicacion): UbicacionEntity {
    return UbicacionEntity.reconstitute(
      {
        nombre: row.nombre,
        descripcion: row.descripcion ?? null,
        padreId: row.padreId ?? null,
        activo: row.activo,
      },
      row.id,
      row.createdAt,
      row.updatedAt,
      row.deletedAt ?? null,
    );
  }

  /**
   * Convierte UbicacionEntity → objeto plano para Prisma upsert. Incluye
   * `createdAt` para el CREATE; el repo lo excluye del UPDATE.
   */
  static toPersistence(entity: UbicacionEntity): Omit<PrismaUbicacion, 'updatedAt'> {
    return {
      id: entity.id,
      nombre: entity.nombre,
      descripcion: entity.descripcion,
      padreId: entity.padreId,
      activo: entity.activo,
      deletedAt: entity.deletedAt,
      createdAt: entity.createdAt,
    };
  }
}
