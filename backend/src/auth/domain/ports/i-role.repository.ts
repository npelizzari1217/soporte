import { RoleEntity } from '../entities/role.entity';

/**
 * IRoleRepository — puerto de persistencia para RoleEntity.
 *
 * Definido en la capa de dominio: sin imports de Prisma ni NestJS.
 * La implementación concreta vive en auth/infrastructure/persistence/prisma/ (PR5).
 *
 * Tarea: T2.2 (PR2 — Auth domain + ports + hashing + token service)
 */
export interface IRoleRepository {
  /**
   * Busca un rol por su código (ej. "ADMINISTRADOR", "TECNICO").
   * No carga permisos (rol básico).
   *
   * @param codigo  Código del rol en mayúsculas.
   * @returns       Entidad del rol si existe, null en caso contrario.
   */
  findByCodigo(codigo: string): Promise<RoleEntity | null>;

  /**
   * Busca un rol por id y carga sus permisos (JOIN con roles_permisos + permisos).
   *
   * @param id  UUIDv7 del rol.
   * @returns   Entidad con permisos cargados, null si no existe.
   */
  findWithPermisos(id: string): Promise<RoleEntity | null>;

  /**
   * Retorna TODOS los roles del catálogo global (no soft-deleted), sin
   * permisos cargados (mismo criterio liviano que `findByCodigo`). Catálogo
   * COMPARTIDO por todos los tenants (`master.roles`) — NO hay roles por
   * cliente. Usado por `GET /roles` (sdd/beta-frontend item 3) para poblar
   * el selector de rol del formulario de alta de usuario.
   */
  findAll(): Promise<RoleEntity[]>;
}

/** Token de inyección de dependencias para IRoleRepository en NestJS. */
export const ROLE_REPOSITORY = Symbol('ROLE_REPOSITORY');
