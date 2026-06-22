import { ClienteEntity } from '../entities/cliente.entity';

/**
 * IClienteRepository — puerto de persistencia para la entidad Cliente.
 *
 * Definido en la capa de dominio: sin imports de Prisma ni NestJS.
 * La implementación concreta vive en infrastructure/persistence/prisma/.
 *
 * Tarea: 1.A.3
 */
export interface IClienteRepository {
  /**
   * Busca un cliente por su identificador técnico (UUIDv7).
   * Retorna null solo si el registro no existe. Los clientes soft-deleted
   * SÍ son retornados (la implementación no filtra por deletedAt).
   */
  findById(id: string): Promise<ClienteEntity | null>;

  /**
   * Busca un cliente por su db_name (discriminador de routing multi-tenant).
   * Retorna null si no existe. Incluye clientes soft-deleted (para validar
   * unicidad incluso sobre registros suspendidos).
   */
  findByDbName(dbName: string): Promise<ClienteEntity | null>;

  /**
   * Retorna todos los clientes, incluyendo los soft-deleted.
   * Filtrar activos / no-deleted en el caso de uso si se necesita.
   */
  findAll(): Promise<ClienteEntity[]>;

  /**
   * Persiste el cliente (upsert: crea si no existe, actualiza si existe).
   * El repositorio decide si es INSERT o UPDATE según si el id ya está en DB.
   */
  save(cliente: ClienteEntity): Promise<void>;

  /**
   * Elimina físicamente un cliente por id (reservado para uso administrativo).
   * Para la baja lógica, usar ClienteEntity.suspend() + save().
   */
  delete(id: string): Promise<void>;
}

/** Token de inyección de dependencias para IClienteRepository en NestJS. */
export const CLIENTE_REPOSITORY = Symbol('CLIENTE_REPOSITORY');
