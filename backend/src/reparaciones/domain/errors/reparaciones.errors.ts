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
