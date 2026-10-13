import { DomainError } from '../../../shared/domain/result';

/**
 * Errores de dominio de las tareas de un ticket (odd/tareas-con-tecnico). Los devuelve
 * `TareaTicketEntity` dentro de un `Result`; el caso de uso decide cómo exponerlos.
 */

/** La tarea fue dada de baja: ya no se completa, descompleta, asigna ni borra. */
export class TareaEliminadaError extends DomainError {
  readonly code = 'TAREA_ELIMINADA';

  constructor(tareaId: string) {
    super(`La tarea "${tareaId}" fue eliminada.`);
  }
}

/** Completar una tarea que ya está completada pisaría el registro de quién la completó. */
export class TareaYaCompletadaError extends DomainError {
  readonly code = 'TAREA_YA_COMPLETADA';

  constructor(tareaId: string) {
    super(`La tarea "${tareaId}" ya está completada.`);
  }
}

/** Descompletar una tarea pendiente no tiene efecto, y se informa en vez de ignorarlo. */
export class TareaNoCompletadaError extends DomainError {
  readonly code = 'TAREA_NO_COMPLETADA';

  constructor(tareaId: string) {
    super(`La tarea "${tareaId}" no está completada.`);
  }
}
