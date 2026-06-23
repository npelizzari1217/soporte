/**
 * UbicacionMapper — convierte entre Prisma Ubicacion (row de DB) y UbicacionEntity (dominio).
 *
 * Dos rutas de mapeo:
 *   toDomain(row)       — desde Prisma model (findUnique/findFirst, camelCase fields).
 *   toDomainFromRaw(row) — desde raw SQL (SELECT de CTE recursiva, snake_case fields).
 *   toPersistence(entity) — UbicacionEntity → objeto para Prisma upsert.
 *
 * IMPORTANTE: este archivo SÍ puede importar de '.prisma/tenant' porque está en
 * infrastructure/. La fitness rule (0.A.3) solo prohíbe imports de Prisma fuera de infra.
 *
 * Tarea: 5.C.2
 */
import type { Ubicacion as PrismaUbicacion } from '.prisma/tenant';
import { UbicacionEntity } from '../../../domain/entities/ubicacion.entity';

/**
 * Shape de las columnas devueltas por la CTE recursiva de findSubtree.
 * Los nombres son snake_case porque vienen de $queryRawUnsafe (Postgres nativo).
 */
export interface RawUbicacionRow {
  id: string;
  nombre: string;
  descripcion: string | null;
  padre_id: string | null;
  activo: boolean;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export class UbicacionMapper {
  /**
   * Desde Prisma model (camelCase) → UbicacionEntity.
   * Usado por findById, findAllActive, save (upsert read-back).
   */
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
   * Desde raw SQL row (snake_case) → UbicacionEntity.
   * Usado por findSubtree ($queryRawUnsafe con CTE recursiva).
   */
  static toDomainFromRaw(row: RawUbicacionRow): UbicacionEntity {
    return UbicacionEntity.reconstitute(
      {
        nombre: row.nombre,
        descripcion: row.descripcion ?? null,
        padreId: row.padre_id ?? null,
        activo: row.activo,
      },
      row.id,
      row.created_at,
      row.updated_at,
      row.deleted_at ?? null,
    );
  }

  /**
   * UbicacionEntity → objeto plano para Prisma upsert.
   * Excluye createdAt y updatedAt (manejados por Prisma @default/@updatedAt).
   */
  static toPersistence(entity: UbicacionEntity): Omit<PrismaUbicacion, 'createdAt' | 'updatedAt'> {
    return {
      id: entity.id,
      nombre: entity.nombre,
      descripcion: entity.descripcion,
      padreId: entity.padreId,
      activo: entity.activo,
      deletedAt: entity.deletedAt,
    };
  }
}
