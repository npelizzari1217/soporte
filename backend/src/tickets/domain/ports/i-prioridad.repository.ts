import { PrioridadEntity } from '../entities/prioridad.entity';

/**
 * IPrioridadRepository — puerto de acceso al catálogo de prioridades del
 * tenant (FIJO, 4 códigos).
 *
 * Ref spec: sdd/tickets-core/spec (Área A — Catálogos). Tarea: T2.1/T2.3
 */
export interface IPrioridadRepository {
  /**
   * Busca una prioridad por su identificador técnico (UUID). Retorna null
   * si no existe (incl. soft-deleted).
   *
   * Usado por `CrearTicketUseCase`/`EditarTicketUseCase` (PR6, T4/T8) para
   * validar `prioridadId`.
   */
  findById(id: string): Promise<PrioridadEntity | null>;

  /**
   * Busca una prioridad por su código semántico (ej. "ALTA", "CRITICA").
   * Retorna null si no existe.
   */
  findByCodigo(codigo: string): Promise<PrioridadEntity | null>;

  /**
   * Retorna el UUID de una prioridad dado su código semántico, sin hidratar
   * la entidad completa. Retorna null si el código no existe.
   */
  findIdByCodigo(codigo: string): Promise<string | null>;

  /**
   * Retorna todas las prioridades activas (no soft-deleted) del tenant,
   * ordenadas por `orden` ASC.
   */
  findAllActive(): Promise<PrioridadEntity[]>;

  /**
   * Persiste un `PrioridadEntity` (upsert por id: INSERT si es nuevo,
   * UPDATE si ya existe). Usado por el CRUD editable (T2, PR11):
   * crear/editar/dar de baja/reactivar.
   */
  save(prioridad: PrioridadEntity): Promise<void>;
}

/** Token de inyección de dependencias para IPrioridadRepository en NestJS. */
export const PRIORIDAD_REPOSITORY = Symbol('PRIORIDAD_REPOSITORY');
