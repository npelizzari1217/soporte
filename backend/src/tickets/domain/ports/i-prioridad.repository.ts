import { PrioridadEntity } from '../entities/prioridad.entity';

/**
 * IPrioridadRepository — puerto de validación FK para prioridades del tenant.
 *
 * Mínimo necesario para que EditarTicketUseCase valide que un prioridadId
 * enviado por el usuario existe en el catálogo antes de persistir.
 *
 * Ref spec: tickets-editar-borrar locked decision L4
 * S2-T9
 */
export interface IPrioridadRepository {
  /**
   * Busca una prioridad por su identificador técnico.
   * Retorna null si no existe. Incluye prioridades soft-deleted.
   */
  findById(id: string): Promise<PrioridadEntity | null>;
}

/** Token de inyección de dependencias para IPrioridadRepository en NestJS. */
export const PRIORIDAD_REPOSITORY = Symbol('PRIORIDAD_REPOSITORY');
