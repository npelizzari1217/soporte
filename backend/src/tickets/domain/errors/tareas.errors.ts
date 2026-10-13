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

/**
 * La tarea no existe, fue dada de baja o pertenece a otro ticket. Las tres se informan igual: un
 * id de otro ticket no revela que la tarea existe. → HTTP 404.
 */
export class TareaNoEncontradaError extends DomainError {
  readonly code = 'TAREA_NO_ENCONTRADA';

  constructor(tareaId: string) {
    super(`No existe la tarea "${tareaId}" en el ticket.`);
  }
}

/**
 * El actor ve el ticket pero no puede hacer esta acción sobre sus tareas (CA3, CA4). → HTTP 403.
 */
export class TareaAccionNoPermitidaError extends DomainError {
  readonly code = 'TAREA_ACCION_NO_PERMITIDA';

  constructor(accion: string) {
    super(`El usuario no tiene permiso para ${accion} tareas de este ticket.`);
  }
}

/**
 * El técnico propuesto no es TECNICO ni COLABORADOR con el módulo del tipo del ticket, la regla
 * del punto 9 (CA3). → HTTP 422.
 */
export class TecnicoTareaNoElegibleError extends DomainError {
  readonly code = 'TECNICO_TAREA_NO_ELEGIBLE';

  constructor(tecnicoId: string) {
    super(`El usuario "${tecnicoId}" no puede ser técnico de una tarea de este ticket.`);
  }
}
