import { UbicacionEntity } from '../entities/ubicacion.entity';

/**
 * IUbicacionRepository — puerto de persistencia para ubicaciones físicas
 * (catálogo del tenant, árbol jerárquico).
 *
 * Definido en la capa de dominio: sin imports de Prisma ni NestJS. La
 * implementación concreta (`PrismaUbicacionRepository`, PR7) obtiene su
 * cliente vía `TenantContext.getClient()`.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-E1, F3-E2. Ref design:
 * "Firmas TS clave" (ports/*), riesgo técnico #3 (findSubtree CTE). Tarea: T6.6.
 */
export interface IUbicacionRepository {
  /**
   * Busca una ubicación por su identificador técnico. Retorna `null` si no
   * existe. Incluye registros soft-deleted (el caller decide qué hacer con
   * `isDeleted()`).
   */
  findById(id: string): Promise<UbicacionEntity | null>;

  /**
   * Retorna todas las ubicaciones del tenant activo (incluye activas e
   * inactivas; excluye soft-deleted), ordenadas por `nombre ASC`.
   */
  findAll(): Promise<UbicacionEntity[]>;

  /**
   * Retorna el subárbol completo a partir de la ubicación indicada: incluye
   * la raíz misma + todos sus descendientes no soft-deleted, en cualquier
   * profundidad. Implementado con CTE recursiva (`WITH RECURSIVE`) para
   * garantizar atomicidad total de lectura + borrado dentro de la misma
   * transacción (usado por `EliminarUbicacionUseCase`).
   *
   * @param ubicacionId UUID del nodo raíz del subárbol.
   * @returns Array [raíz, ...descendientes]. Vacío si el nodo no existe o
   *          ya fue soft-deleted.
   */
  findSubtree(ubicacionId: string): Promise<UbicacionEntity[]>;

  /**
   * Persiste la ubicación (upsert: crea si no existe, actualiza si existe).
   */
  save(ubicacion: UbicacionEntity): Promise<void>;

  /**
   * Baja lógica de la ubicación (soft delete). NO elimina la fila — setea
   * `deleted_at`. La propagación a hijos es responsabilidad del use case
   * (`EliminarUbicacionUseCase` usa `findSubtree` + `delete` en loop dentro
   * de la misma transacción).
   */
  delete(id: string): Promise<void>;
}

/** Token de inyección de dependencias para IUbicacionRepository en NestJS. */
export const UBICACION_REPOSITORY = Symbol('UBICACION_REPOSITORY');
