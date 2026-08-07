import { DomainError } from '../../../shared/domain/result';

/**
 * Errores de dominio del módulo `reparaciones/` (Fase 3, F3-E1..E5).
 *
 * Mismo patrón que `compras/domain/errors/compras.errors.ts`: cada error
 * extiende `DomainError`, expone un `code` estable y se modela con
 * `Result.fail()` — nunca `throw` para fallos esperados del dominio.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-E1..E5. Ref design: "Firmas TS
 * clave" (lista de errores de reparaciones.errors.ts). Tarea: T6.6.
 */

/**
 * TicketEdiliciaNoEncontradoError — el satélite `ticket_edilicia` con el
 * id/ticketId indicado no existe (o no fue creado — el ticket puede no ser
 * de tipo EDILICIA).
 * → HTTP 404 en la capa de presentación.
 *
 * Ref spec: F3-E3, F3-E4, F3-E5.
 */
export class TicketEdiliciaNoEncontradoError extends DomainError {
  readonly code = 'TICKET_EDILICIA_NO_ENCONTRADO';

  constructor(id: string) {
    super(`Ticket edilicio con id "${id}" no encontrado.`);
  }
}

/**
 * UbicacionInvalidaError — una `ubicacion` referenciada (por un ticket
 * edilicio al crearse, o por un `padreId` en el árbol de ubicaciones) no
 * existe, está inactiva o fue eliminada (soft delete).
 * → HTTP 422 en la capa de presentación.
 *
 * Ref spec: F3-E1, F3-E2.
 */
export class UbicacionInvalidaError extends DomainError {
  readonly code = 'UBICACION_INVALIDA';

  constructor(ubicacionId: string) {
    super(
      `La ubicación "${ubicacionId}" no existe, está inactiva o fue eliminada. ` +
        `Solo se pueden referenciar ubicaciones activas y no eliminadas.`,
    );
  }
}

/**
 * UbicacionNoEncontradaError — la ubicación con el id indicado (recurso
 * primario de la operación: editar/eliminar) no existe o fue eliminada.
 * → HTTP 404 en la capa de presentación.
 *
 * Ref spec: F3-E2.
 */
export class UbicacionNoEncontradaError extends DomainError {
  readonly code = 'UBICACION_NO_ENCONTRADA';

  constructor(ubicacionId: string) {
    super(`Ubicación con id "${ubicacionId}" no encontrada o fue eliminada.`);
  }
}

/**
 * SubtareaNoEncontradaError — la subtarea edilicia con el id indicado no
 * existe o fue eliminada (soft delete).
 * → HTTP 404 en la capa de presentación.
 *
 * Ref spec: F3-E4, F3-E5.
 */
export class SubtareaNoEncontradaError extends DomainError {
  readonly code = 'SUBTAREA_NO_ENCONTRADA';

  constructor(subtareaId: string) {
    super(`Subtarea edilicia con id "${subtareaId}" no encontrada o fue eliminada.`);
  }
}
