import { UbicacionEntity } from '../entities/ubicacion.entity';

/**
 * IUbicacionRepository — puerto de persistencia para ubicaciones físicas.
 *
 * Definido en la capa de dominio: sin imports de Prisma ni NestJS.
 * La implementación concreta vive en infrastructure/persistence/prisma/.
 * El repositorio opera dentro del tenant activo (client desde TenantContext).
 *
 * Ref spec: [SPEC:reparaciones/Tabla ubicaciones, Ubicaciones jerárquicas]
 * Tarea: 5.A.5 + PR-15a (findSubtree)
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
   * Retorna el subárbol completo a partir de la ubicación indicada:
   * incluye la raíz misma + todos sus descendientes no soft-deleted (ANY activo).
   *
   * Implementado con CTE recursiva (WITH RECURSIVE) dentro de la transacción
   * activa, garantizando atomicidad total de read + delete.
   *
   * Usado por EliminarUbicacionUseCase para obtener el árbol completo
   * de ubicaciones a soft-deletear en una sola query dentro de la tx.
   *
   * @param ubicacionId UUID del nodo raíz del subárbol.
   * @returns Array [raíz, ...descendientes] en orden BFS. Vacío si el nodo
   *          no existe o ya fue soft-deleted.
   */
  findSubtree(ubicacionId: string): Promise<UbicacionEntity[]>;

  /**
   * Persiste la ubicación (upsert: crea si no existe, actualiza si existe).
   */
  save(ubicacion: UbicacionEntity): Promise<void>;

  /**
   * Baja lógica de la ubicación (soft delete).
   * NO elimina la fila — setea deleted_at.
   * La propagación a hijos es responsabilidad del use case (EliminarUbicacionUseCase
   * usa findSubtree + delete en loop dentro de la misma transacción).
   */
  delete(id: string): Promise<void>;
}

/** Token de inyección de dependencias para IUbicacionRepository en NestJS. */
export const UBICACION_REPOSITORY = Symbol('UBICACION_REPOSITORY');
