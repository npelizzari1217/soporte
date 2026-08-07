/**
 * RoleMapper — convierte entre Prisma Role (con y sin permisos) y RoleEntity.
 *
 * Importa de '.prisma/master' solo porque está en infrastructure/.
 * Tarea: T5.4 (PR5 — Persistencia + Prisma repos + TenantContext)
 */
import type { Role as PrismaRole, RolesPermisos, Permiso as PrismaPermiso } from '.prisma/master';
import { RoleEntity } from '../../../domain/entities/role.entity';
import { PermisoMapper } from './permiso.mapper';

/** Prisma row sin permisos (findByCodigo). */
type PrismaRoleBasic = PrismaRole;

/** Prisma row con permisos incluidos (findWithPermisos). */
export type PrismaRoleWithPermisos = PrismaRole & {
  rolesPermisos: (RolesPermisos & {
    permiso: PrismaPermiso;
  })[];
};

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

  /** Para findWithPermisos: RoleEntity con permisos hidratados. */
  static toDomainWithPermisos(row: PrismaRoleWithPermisos): RoleEntity {
    const permisos = row.rolesPermisos.map((rp) => PermisoMapper.toDomain(rp.permiso));
    return RoleEntity.reconstitute(
      {
        codigo: row.codigo,
        nombre: row.nombre,
        descripcion: row.descripcion ?? null,
        permisos,
      },
      row.id,
      row.createdAt,
      row.updatedAt,
      row.deletedAt ?? null,
    );
  }
}
