import { UsuarioEntity } from '../entities/usuario.entity';

/**
 * IUsuarioRepository — puerto de persistencia para la entidad Usuario.
 *
 * Definido en la capa de dominio: sin imports de Prisma ni NestJS.
 * La implementación concreta vive en auth/infrastructure/persistence/prisma/ (PR5).
 *
 * ADR-1: el usuario es identidad GLOBAL (sin `cliente_id`). Los lookups NO
 * cargan roles — el rol vive en la membresía y se resuelve por separado vía
 * `IMembresiaRepository` (R3, R4).
 *
 * Tarea: T2.2 (PR2 — Auth domain + ports + hashing + token service)
 */
export interface IUsuarioRepository {
  /**
   * Busca un usuario por email (login lookup, R3).
   * Incluye usuarios soft-deleted / inactivos (el use case filtra por
   * activo/deletedAt para poder ejecutar la defensa timing-safe antes del
   * early-return).
   */
  findByEmail(email: string): Promise<UsuarioEntity | null>;

  /**
   * Busca usuarios cuyo email coincide sin distinguir mayúsculas (login SSO, ADR-5).
   * Devuelve a lo sumo 2: alcanza para distinguir "ninguno", "uno" y "ambiguo".
   * `findByEmail` sigue siendo exacto.
   */
  findManyByEmailInsensitive(email: string): Promise<UsuarioEntity[]>;

  /**
   * Busca un usuario por su identificador técnico (UUIDv7).
   * Incluye usuarios soft-deleted.
   */
  findById(id: string): Promise<UsuarioEntity | null>;

  /**
   * Crea un nuevo usuario en la base de datos.
   */
  create(entity: UsuarioEntity): Promise<void>;

  /**
   * Persiste el usuario (upsert: crea si no existe, actualiza si existe).
   */
  save(usuario: UsuarioEntity): Promise<void>;
}

/** Token de inyección de dependencias para IUsuarioRepository en NestJS. */
export const USUARIO_REPOSITORY = Symbol('USUARIO_REPOSITORY');
