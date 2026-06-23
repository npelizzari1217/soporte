import { TipoComponenteEntity } from '../entities/tipos-componente.entity';

/**
 * ITiposComponenteRepository — puerto de persistencia para el catálogo TipoComponente.
 *
 * Definido en la capa de dominio: sin imports de Prisma ni NestJS.
 * La implementación concreta vive en infrastructure/persistence/prisma/.
 * El repositorio opera dentro del tenant activo (client desde TenantContext).
 *
 * Ref spec: [SPEC:equipos/Tabla tipos_componente]
 * Tarea: 6.A.3
 */
export interface ITiposComponenteRepository {
  /**
   * Busca un tipo de componente por su identificador técnico (UUIDv7).
   * Retorna null si no existe. Incluye tipos soft-deleted.
   */
  findById(id: string): Promise<TipoComponenteEntity | null>;

  /**
   * Busca un tipo de componente por su código único (ej. 'CPU', 'RAM').
   * Retorna null si no existe.
   */
  findByCodigo(codigo: string): Promise<TipoComponenteEntity | null>;

  /**
   * Retorna todos los tipos de componente activos (activo=true, deleted_at IS NULL).
   * Útil para poblar selectores en la UI de gestión de componentes.
   */
  findAllActive(): Promise<TipoComponenteEntity[]>;

  /**
   * Persiste el tipo de componente (upsert: crea si no existe, actualiza si existe).
   */
  save(tipoComponente: TipoComponenteEntity): Promise<void>;
}

/** Token de inyección de dependencias para ITiposComponenteRepository en NestJS. */
export const TIPOS_COMPONENTE_REPOSITORY = Symbol('TIPOS_COMPONENTE_REPOSITORY');
