import { UsuarioEntity } from '../entities/usuario.entity';

/**
 * IUsuarioRepository — puerto de persistencia para la entidad Usuario.
 *
 * Definido en la capa de dominio: sin imports de Prisma ni NestJS.
 * La implementación concreta vive en auth/infrastructure/persistence/prisma/ → PR-06.
 *
 * Los métodos findByEmail y findById deben retornar el usuario con sus roles
 * y permisos pre-cargados (el repo hace el JOIN internamente).
 *
 * Tarea: 2.A.3
 */
export interface IUsuarioRepository {
  /**
   * Busca un usuario por email (login lookup).
   * Retorna el usuario con roles+permisos cargados.
   * Incluye usuarios soft-deleted (el use case filtra por activo/deletedAt).
   */
  findByEmail(email: string): Promise<UsuarioEntity | null>;

  /**
   * Busca un usuario por su identificador técnico (UUIDv7).
   * Retorna el usuario con roles+permisos cargados.
   * Incluye usuarios soft-deleted.
   */
  findById(id: string): Promise<UsuarioEntity | null>;

  /**
   * Retorna todos los usuarios activos (sin soft-delete) pertenecientes a un cliente dado.
   * Excluye usuarios con `deleted_at IS NOT NULL`.
   * Incluye usuarios con `activo = FALSE` (administrador ve inactivos).
   * Útil para listados administrativos por tenant.
   *
   * Spec ref: clientes-tenancy/GET /usuarios
   * Tarea: T3.1
   */
  findByClienteId(clienteId: string): Promise<UsuarioEntity[]>;

  /**
   * Crea un nuevo usuario en la base de datos.
   * Equivale a save() para entidades nuevas; expuesto como método semántico
   * para claridad en CrearUsuarioUseCase.
   *
   * Spec ref: clientes-tenancy/POST /usuarios
   * Tarea: T3.1
   */
  create(entity: UsuarioEntity): Promise<void>;

  /**
   * Persiste el usuario (upsert: crea si no existe, actualiza si existe).
   * También persiste los cambios en usuarios_roles si los roles cambiaron.
   */
  save(usuario: UsuarioEntity): Promise<void>;
}

/** Token de inyección de dependencias para IUsuarioRepository en NestJS. */
export const USUARIO_REPOSITORY = Symbol('USUARIO_REPOSITORY');
