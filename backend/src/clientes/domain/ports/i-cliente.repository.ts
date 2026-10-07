import { ClienteEntity } from '../entities/cliente.entity';

/** Resultado de `cambiarSlugSiNoCongelado`. */
export type ResultadoCambioSlug = 'CAMBIADO' | 'CONGELADO' | 'DUPLICADO';

/**
 * IClienteRepository — puerto de persistencia para la entidad Cliente.
 *
 * Definido en la capa de dominio: sin imports de Prisma ni NestJS.
 * La implementación concreta (prisma-cliente.repository + mapper) vive en
 * clientes/infrastructure/persistence/prisma/ (PR8).
 *
 * Alcance de PR3: `resolverScope` (auth/application) consume únicamente
 * `findById` para validar que el `clienteId` solicitado en login/switch/
 * refresh corresponda a un cliente vivo (R5, R10). El resto de la interfaz
 * (findByDbName/findAll/save/delete) se declara ahora para no romper el
 * contrato cuando PR8 implemente el CRUD completo de provisioning.
 */
export interface IClienteRepository {
  /**
   * Busca un cliente por su identificador técnico (UUIDv7).
   * Retorna null solo si el registro no existe. Los clientes soft-deleted
   * SÍ son retornados (el consumidor filtra por `activo`/`isDeleted()`).
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
   * Busca un cliente por su slug (formulario publico). Retorna null si no
   * existe. Incluye inactivos y soft-deleted: el consumidor filtra.
   */
  findBySlug(slug: string): Promise<ClienteEntity | null>;

  /**
   * CAS de congelamiento (ADR-2): marca `slug_congelado_at` solo si el slug
   * actual sigue siendo `slugEsperado` (`coalesce`: no pisa una marca previa).
   * Devuelve `false` si el slug cambio (0 filas) y el caller debe abortar.
   */
  congelarSlug(id: string, slugEsperado: string): Promise<boolean>;

  /**
   * CAS de cambio de slug (ADR-2): escribe `nuevo` solo si el slug no esta
   * congelado. `CONGELADO` si hay 0 filas por la marca (o el cliente no
   * existe), `DUPLICADO` si otro cliente ya usa ese slug.
   */
  cambiarSlugSiNoCongelado(id: string, nuevo: string): Promise<ResultadoCambioSlug>;

  /**
   * Politica de 2FA del cliente (`requiere_2fa`). Se escribe SOLO aca, con un UPDATE
   * dirigido: `save` no la lleva, asi que una entidad vieja no puede pisarla.
   * Devuelve `false` si el cliente no existe.
   */
  fijarRequiere2fa(id: string, requiere: boolean): Promise<boolean>;

  /** Lee solo `requiere_2fa`; `null` si el cliente no existe. */
  obtenerRequiere2fa(id: string): Promise<boolean | null>;

  /**
   * Persiste el cliente (upsert: crea si no existe, actualiza si existe).
   * El repositorio decide si es INSERT o UPDATE según si el id ya está en DB.
   * NO escribe `slug` ni `slugCongeladoAt` (solo los CAS de arriba): un save
   * con una entidad vieja no puede descongelar ni pisar un slug.
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
