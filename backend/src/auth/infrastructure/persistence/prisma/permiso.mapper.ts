/**
 * PermisoMapper — convierte entre Prisma Permiso y PermisoEntity.
 *
 * Importa de '.prisma/master' solo porque está en infrastructure/.
 * Tarea: T5.4 (PR5 — Persistencia + Prisma repos + TenantContext)
 */
import type { Permiso as PrismaPermiso } from '.prisma/master';
import { PermisoEntity } from '../../../domain/entities/permiso.entity';

export class PermisoMapper {
  /** Reconstitución desde DB — el código ya fue validado al crearse (skip validateCodigo). */
  static toDomain(row: PrismaPermiso): PermisoEntity {
    return PermisoEntity.reconstitute(
      {
        codigo: row.codigo,
        descripcion: row.descripcion ?? null,
      },
      row.id,
      row.createdAt,
      row.updatedAt,
      row.deletedAt ?? null,
    );
  }
}
