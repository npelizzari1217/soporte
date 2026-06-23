import { UbicacionEntity } from '../entities/ubicacion.entity';

/**
 * IUbicacionRepository — puerto de persistencia para ubicaciones físicas.
 *
 * Definido en la capa de dominio: sin imports de Prisma ni NestJS.
 * La implementación concreta vive en infrastructure/persistence/prisma/.
 * El repositorio opera dentro del tenant activo (client desde TenantContext).
 *
 * Ref spec: [SPEC:reparaciones/Tabla ubicaciones, Ubicaciones jerárquicas]
 * Tarea: 5.A.5
 */
export interface IUbicacionRepository {
  /**
   * Busca una ubicación por su identificador técnico.
   * Retorna null si no existe.
   */
  findById(id: string): Promise<UbicacionEntity | null>;

  /**
   * Retorna todas las ubicaciones activas (activo=true y deleted_at IS NULL).
   * Útil para poblar selectores de ubicación en la UI.
   */
  findAllActive(): Promise<UbicacionEntity[]>;

  /**
   * Retorna los hijos directos de una ubicación padre.
   * Incluye tanto activas como inactivas (no soft-deleted).
   *
   * @param padreId UUID del nodo padre.
   */
  findByPadreId(padreId: string): Promise<UbicacionEntity[]>;

  /**
   * Persiste la ubicación (upsert: crea si no existe, actualiza si existe).
   */
  save(ubicacion: UbicacionEntity): Promise<void>;

  /**
   * Baja lógica de la ubicación (soft delete).
   * NO elimina la fila — setea deleted_at.
   * La propagación a hijos es responsabilidad del use case (cascada lógica).
   */
  delete(id: string): Promise<void>;
}

/** Token de inyección de dependencias para IUbicacionRepository en NestJS. */
export const UBICACION_REPOSITORY = Symbol('UBICACION_REPOSITORY');
