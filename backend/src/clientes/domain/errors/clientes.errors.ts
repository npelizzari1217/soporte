import { DomainError } from '../../../shared/domain/result';

/**
 * ClienteConflictError — se lanza cuando se intenta registrar un cliente
 * con un db_name que ya existe en el sistema.
 * → HTTP 409 Conflict en la capa de presentación.
 */
export class ClienteConflictError extends DomainError {
  readonly code = 'CLIENTE_CONFLICT';

  constructor(dbName: string) {
    super(`Ya existe un cliente con db_name "${dbName}".`);
  }
}

/**
 * ClienteNotFoundError — se lanza cuando no se encuentra un cliente por id.
 * → HTTP 404 Not Found en la capa de presentación.
 */
export class ClienteNotFoundError extends DomainError {
  readonly code = 'CLIENTE_NOT_FOUND';

  constructor(id: string) {
    super(`Cliente con id "${id}" no encontrado.`);
  }
}

/**
 * CicloVigenteOverlapError — se lanza cuando el rango de fechas de un nuevo
 * ciclo vigente se solapa con un ciclo activo no eliminado.
 * → HTTP 422 Unprocessable Entity en la capa de presentación.
 */
export class CicloVigenteOverlapError extends DomainError {
  readonly code = 'CICLO_VIGENTE_OVERLAP';

  constructor() {
    super('Las fechas del nuevo ciclo vigente se solapan con un ciclo activo existente.');
  }
}

/**
 * CicloVigenteInvalidDatesError — se lanza cuando fecha_fin <= fecha_inicio.
 * Es un invariante estructural del ciclo, validado en construcción.
 * → HTTP 422 Unprocessable Entity en la capa de presentación.
 */
export class CicloVigenteInvalidDatesError extends DomainError {
  readonly code = 'CICLO_VIGENTE_INVALID_DATES';

  constructor() {
    super('fecha_fin debe ser estrictamente mayor que fecha_inicio.');
  }
}

/**
 * CicloVigenteNotFoundError — se lanza cuando no se encuentra un ciclo vigente
 * (catálogo global) por id.
 * → HTTP 404 Not Found en la capa de presentación.
 */
export class CicloVigenteNotFoundError extends DomainError {
  readonly code = 'CICLO_VIGENTE_NOT_FOUND';

  constructor(id: string) {
    super(`Ciclo vigente con id "${id}" no encontrado.`);
  }
}
