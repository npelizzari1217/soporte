/**
 * UsuarioMapper — convierte entre Prisma Usuario (con roles+permisos) y UsuarioEntity.
 *
 * La hydration completa (roles → permisos) es responsabilidad del repositorio:
 * siempre pasa el include nested al query de Prisma.
 *
 * Importa de '.prisma/master' solo porque está en infrastructure/.
 * Tarea: 2.C.2 + W3 (roles+permisos hydration)
 */
import type {
  Usuario as PrismaUsuario,
  UsuariosRoles,
  Role as PrismaRole,
  RolesPermisos,
  Permiso as PrismaPermiso,
} from '.prisma/master';
import { UsuarioEntity } from '../../../domain/entities/usuario.entity';
import { RoleMapper } from './role.mapper';

/**
 * Prisma row con todos los niveles de include necesarios para hydration completa:
 * Usuario → usuariosRoles → rol → rolesPermisos → permiso
 */
export type PrismaUsuarioWithRoles = PrismaUsuario & {
  usuariosRoles: (UsuariosRoles & {
    rol: PrismaRole & {
      rolesPermisos: (RolesPermisos & {
        permiso: PrismaPermiso;
      })[];
    };
  })[];
};

/** Include clause que retorna el tipo PrismaUsuarioWithRoles. */
export const USUARIO_INCLUDE = {
  usuariosRoles: {
    include: {
      rol: {
        include: {
          rolesPermisos: {
            include: {
              permiso: true,
            },
          },
        },
      },
    },
  },
} as const;

export class UsuarioMapper {
  /** Convierte Prisma row con roles+permisos a UsuarioEntity de dominio. */
  static toDomain(row: PrismaUsuarioWithRoles): UsuarioEntity {
    const roles = row.usuariosRoles.map((ur) => RoleMapper.toDomainWithPermisos(ur.rol));

    return UsuarioEntity.reconstitute(
      {
        email: row.email,
        nombre: row.nombre,
        apellido: row.apellido,
        passwordHash: row.passwordHash,
        clienteId: row.clienteId,
        activo: row.activo,
        isGlobalAdmin: row.isGlobalAdmin,
        roles,
      },
      row.id,
      row.createdAt,
      row.updatedAt,
      row.deletedAt ?? null,
    );
  }

  /** Convierte UsuarioEntity a data plana para Prisma upsert (SIN roles — se sincronizan por separado). */
  static toPersistence(
    entity: UsuarioEntity,
  ): Omit<PrismaUsuario, 'createdAt' | 'updatedAt' | 'clienteId'> & { clienteId: string } {
    return {
      id: entity.id,
      email: entity.email,
      nombre: entity.nombre,
      apellido: entity.apellido,
      passwordHash: entity.passwordHash,
      clienteId: entity.clienteId,
      activo: entity.activo,
      isGlobalAdmin: entity.isGlobalAdmin,
      deletedAt: entity.deletedAt,
    };
  }
}
