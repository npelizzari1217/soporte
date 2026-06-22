import { RoleEntity } from '../entities/role.entity';

/**
 * IRoleRepository — puerto de persistencia para RoleEntity.
 *
 * Definido en la capa de dominio: sin imports de Prisma ni NestJS.
 * La implementación concreta vive en auth/infrastructure/persistence/prisma/ → PR-06.
 *
 * Tarea: 2.A.3
 */
export interface IRoleRepository {
  /**
   * Busca un rol por su código (ej. "ADMIN", "SOPORTE_IT").
   * No carga permisos (rol básico).
   *
   * @param codigo  Código del rol en mayúsculas.
   * @returns       Entidad del rol si existe, null en caso contrario.
   */
  findByCodigo(codigo: string): Promise<RoleEntity | null>;

  /**
   * Busca un rol por id y carga sus permisos (JOIN con roles_permisos + permisos).
   * Usado cuando se necesita conocer los permisos de un rol específico.
   *
   * @param id  UUIDv7 del rol.
   * @returns   Entidad con permisos cargados, null si no existe.
   */
  findWithPermisos(id: string): Promise<RoleEntity | null>;
}

/** Token de inyección de dependencias para IRoleRepository en NestJS. */
export const ROLE_REPOSITORY = Symbol('ROLE_REPOSITORY');
