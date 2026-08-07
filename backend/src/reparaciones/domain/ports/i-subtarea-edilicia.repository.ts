import { SubtareaEdiliciaEntity } from '../entities/subtarea-edilicia.entity';

/**
 * ISubtareaEdiliciaRepository — puerto de persistencia para subtareas
 * edilicias (checklist de avance).
 *
 * Definido en la capa de dominio: sin imports de Prisma ni NestJS. La
 * implementación concreta (`PrismaSubtareaEdiliciaRepository`, PR7) obtiene
 * su cliente vía `TenantContext.getClient()`.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-E3, F3-E4, F3-E5. Ref design:
 * "Firmas TS clave" (ports/*). Tarea: T6.6.
 */
export interface ISubtareaEdiliciaRepository {
  /**
   * Busca una subtarea por su identificador técnico. Retorna `null` si no
   * existe. Incluye registros soft-deleted.
   */
  findById(id: string): Promise<SubtareaEdiliciaEntity | null>;

  /**
   * Retorna todas las subtareas ACTIVAS (`deleted_at IS NULL`) de un
   * `ticket_edilicia`, ordenadas por `orden ASC, created_at ASC`. Usadas
   * por `AvanceCalculator.calcularDesdeSubtareas()` para recalcular el
   * avance.
   */
  findActiveByTicketEdiliciaId(ticketEdiliciaId: string): Promise<SubtareaEdiliciaEntity[]>;

  /**
   * Persiste la subtarea (upsert: crea si no existe, actualiza si existe).
   */
  save(subtarea: SubtareaEdiliciaEntity): Promise<void>;

  /**
   * Baja lógica de la subtarea (soft delete). NO elimina la fila — setea
   * `deleted_at`. Después del soft delete, el use case recalcula el avance
   * del `ticket_edilicia` sobre las activas restantes.
   */
  delete(id: string): Promise<void>;
}

/** Token de inyección de dependencias para ISubtareaEdiliciaRepository en NestJS. */
export const SUBTAREA_EDILICIA_REPOSITORY = Symbol('SUBTAREA_EDILICIA_REPOSITORY');
