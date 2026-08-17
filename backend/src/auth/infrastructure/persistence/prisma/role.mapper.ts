/**
 * RoleMapper — convierte entre Prisma Role y RoleEntity.
 *
 * Fix post-verify C2 (sdd/matriz-permisos-por-usuario): `toDomainWithPermisos`
 * (JOIN `rolesPermisos → permiso`, RBAC viejo) se retiró junto con
 * `PrismaRoleRepository.findWithPermisos` — ver ese archivo.
 *
 * Importa de '.prisma/master' solo porque está en infrastructure/.
 * Tarea: T5.4 (PR5 — Persistencia + Prisma repos + TenantContext)
 */
import type { Role as PrismaRole } from '.prisma/master';
import { RoleEntity } from '../../../domain/entities/role.entity';

/** Prisma row sin permisos (findByCodigo). */
type PrismaRoleBasic = PrismaRole;

export class RoleMapper {
  /** Para findByCodigo: RoleEntity sin permisos cargados. */
  static toDomain(row: PrismaRoleBasic): RoleEntity {
    return RoleEntity.reconstitute(
      {
        codigo: row.codigo,
        nombre: row.nombre,
        descripcion: row.descripcion ?? null,
        permisos: [],
      },
      row.id,
      row.createdAt,
      row.updatedAt,
      row.deletedAt ?? null,
    );
  }
}
