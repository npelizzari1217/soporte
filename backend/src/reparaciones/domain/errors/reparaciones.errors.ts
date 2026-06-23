import { DomainError } from '../../../shared/domain/result';

// ─── Application-level errors (use case failures) ────────────────────────────

/**
 * Error de validación: la ubicación no existe o está inactiva/eliminada.
 * Se verifica al crear un ticket edilicio o al referenciar una ubicación activa.
 *
 * Ref spec: [SPEC:reparaciones/ticket_edilicia requiere ubicacion válida]
 * Tarea: 5.B.1 / 5.B.2
 */
export class UbicacionInvalidaError extends DomainError {
  readonly code = 'UBICACION_INVALIDA';

  constructor(ubicacionId: string) {
    super(
      `La ubicación "${ubicacionId}" no existe, está inactiva (activo=false) ` +
        `o fue eliminada (deleted_at IS NOT NULL). ` +
        `Solo se pueden referenciar ubicaciones activas y no eliminadas.`,
    );
  }
}

/**
 * Error de búsqueda: el satélite ticket_edilicia no existe para el ticket indicado.
 * Puede indicar que el ticket no es de tipo EDILICIA o que el satélite no fue creado.
 *
 * Ref spec: [SPEC:reparaciones/Satélite obligatorio]
 * Tarea: 5.B.3 / 5.B.5
 */
export class TicketEdiliciaNoEncontradoError extends DomainError {
  readonly code = 'TICKET_EDILICIA_NO_ENCONTRADO';

  constructor(ticketId: string) {
    super(
      `No se encontró ticket_edilicia para el ticket "${ticketId}". ` +
        `El ticket puede no ser de tipo EDILICIA o el satélite no fue creado correctamente.`,
    );
  }
}

/**
 * Error de búsqueda: la subtarea edilicia con el id indicado no existe o fue eliminada.
 * HTTP 404 semántico.
 *
 * Ref spec: [SPEC:reparaciones/Tabla subtareas_edilicia]
 * Tarea: 5.B.5 / 5.B.6
 */
export class SubtareaEdiliciaNoEncontradaError extends DomainError {
  readonly code = 'SUBTAREA_EDILICIA_NO_ENCONTRADA';

  constructor(subtareaId: string) {
    super(`Subtarea edilicia con id "${subtareaId}" no encontrada o fue eliminada (soft delete).`);
  }
}

/**
 * Error de estado: la subtarea ya fue marcada como completada.
 * Una subtarea completada no puede completarse dos veces.
 *
 * Ref spec: [SPEC:reparaciones/completada = TRUE es estado terminal de subtarea]
 * Tarea: 5.B.5 / 5.B.6
 */
export class SubtareaYaCompletadaError extends DomainError {
  readonly code = 'SUBTAREA_YA_COMPLETADA';

  constructor(subtareaId: string) {
    super(
      `La subtarea edilicia "${subtareaId}" ya fue marcada como completada. ` +
        `No se puede completar una subtarea que ya tiene completada=TRUE.`,
    );
  }
}

/**
 * Error de validación: se intentó usar una ubicación soft-deleted como padre_id.
 * Una ubicación eliminada no puede ser referenciada como padre en la jerarquía.
 *
 * Ref spec: [SPEC:reparaciones/Ubicaciones jerárquicas, Soft delete cascada]
 * Tarea: 5.B.7 / 5.B.8
 */
export class PadreUbicacionEliminadoError extends DomainError {
  readonly code = 'PADRE_UBICACION_ELIMINADO';

  constructor(padreId: string) {
    super(
      `La ubicación padre "${padreId}" fue eliminada (soft delete). ` +
        `No se puede referenciar una ubicación eliminada como padre_id.`,
    );
  }
}

/**
 * Error de validación: el ticket no es de tipo EDILICIA.
 * Se verifica al crear el satélite ticket_edilicia.
 *
 * Ref spec: [SPEC:reparaciones/Satélite obligatorio — solo tickets de tipo EDILICIA]
 * Tarea: 5.B.1 / 5.B.2
 */
export class TicketNoEsEdiliciaError extends DomainError {
  readonly code = 'TICKET_NO_ES_EDILICIA';

  constructor(tipoCodigo: string) {
    super(
      `El ticket es de tipo "${tipoCodigo}", no de tipo "EDILICIA". ` +
        `No se puede crear el satélite ticket_edilicia para un ticket que no es de tipo EDILICIA.`,
    );
  }
}
