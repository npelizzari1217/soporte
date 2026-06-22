/**
 * PermisoMapper — convierte entre Prisma Permiso y PermisoEntity.
 *
 * Importa de '.prisma/master' solo porque está en infrastructure/.
 * Tarea: 2.C.2
 */
import type { Permiso as PrismaPermiso } from '.prisma/master';
import { PermisoEntity } from '../../../domain/entities/permiso.entity';

export class PermisoMapper {
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
