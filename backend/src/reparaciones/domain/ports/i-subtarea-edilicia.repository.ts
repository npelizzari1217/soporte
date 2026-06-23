import { SubtareaEdiliciaEntity } from '../entities/subtarea-edilicia.entity';

/**
 * ISubtareaEdiliciaRepository — puerto de persistencia para subtareas edilicias.
 *
 * Definido en la capa de dominio: sin imports de Prisma ni NestJS.
 * La implementación concreta vive en infrastructure/persistence/prisma/.
 * El repositorio opera dentro del tenant activo (client desde TenantContext).
 *
 * Ref spec: [SPEC:reparaciones/Tabla subtareas_edilicia, Avance derivado de subtareas]
 * Tarea: 5.A.5
 */
export interface ISubtareaEdiliciaRepository {
  /**
   * Busca una subtarea por su identificador técnico.
   * Retorna null si no existe.
   */
  findById(id: string): Promise<SubtareaEdiliciaEntity | null>;

  /**
   * Retorna todas las subtareas activas (deleted_at IS NULL) de un ticket edilicio.
   * Ordenadas por orden ASC, created_at ASC.
   *
   * Usadas por AvanceCalculator.calcularDesdeSubtareas() para recalcular el avance.
   *
   * @param ticketEdiliciaId UUID del ticket_edilicia.
   */
  findActiveByTicketEdiliciaId(ticketEdiliciaId: string): Promise<SubtareaEdiliciaEntity[]>;

  /**
   * Retorna TODAS las subtareas de un ticket edilicio (incluyendo soft-deleted).
   * Útil para la vista de timeline completo.
   *
   * @param ticketEdiliciaId UUID del ticket_edilicia.
   */
  findAllByTicketEdiliciaId(ticketEdiliciaId: string): Promise<SubtareaEdiliciaEntity[]>;

  /**
   * Persiste la subtarea (upsert: crea si no existe, actualiza si existe).
   *
   * La creación y completitud de subtareas se realizan dentro del mismo
   * txRunner.run() que actualiza el porcentaje de avance del ticket edilicio.
   */
  save(subtarea: SubtareaEdiliciaEntity): Promise<void>;

  /**
   * Baja lógica de la subtarea (soft delete).
   * NO elimina la fila — setea deleted_at.
   * Después del soft delete, el use case recalcula el avance del ticket edilicio.
   */
  delete(id: string): Promise<void>;
}

/** Token de inyección de dependencias para ISubtareaEdiliciaRepository en NestJS. */
export const SUBTAREA_EDILICIA_REPOSITORY = Symbol('SUBTAREA_EDILICIA_REPOSITORY');
