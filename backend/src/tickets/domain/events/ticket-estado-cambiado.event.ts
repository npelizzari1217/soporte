import { DomainEvent } from '../../../shared/domain/domain-event';

/** Nombre del evento — topic usado por EventEmitter2. */
export const TICKET_ESTADO_CAMBIADO = 'ticket.estado.cambiado';

/**
 * TicketEstadoCambiado — evento de dominio publicado post-commit cuando un
 * ticket transiciona a un estado del set notificable (ver
 * `estados-notificables.policy.ts`).
 *
 * Publicado desde los DOS caminos de cambio de estado (design.md §6):
 *   A) TransicionarEstadoUseCase.execute() — camino oficial (PATCH).
 *   B) CrearObservacionUseCase.execute() — auto-transición inline (POST observación).
 *
 * Lleva `estadoAnteriorCodigo`/`estadoNuevoCodigo` (D4) además de los UUIDs,
 * para que el filtro del handler (`esEstadoNotificable`) sea una función PURA
 * sin tocar la DB — el TenantContext puede no estar disponible en un listener
 * async post-request.
 *
 * `numero`/`tituloTicket` (PR4, task 4.14 — decisión de diseño del usuario
 * 2026-07-30): campos de DISPLAY para que el handler arme el email sin volver
 * a consultar el ticket. Ambos use cases los pueblan desde la `TicketEntity`
 * que YA tienen en la mano al publicar (post-commit) — SIN query extra. D4
 * se AMPLÍA pero no se contradice: la decisión de NOTIFICAR sigue siendo una
 * función pura sobre `estadoNuevoCodigo` (`esEstadoNotificable`), sin tocar
 * la DB; estos 2 campos son solo payload adicional para el template, no
 * entran en el filtro.
 *
 * Ref spec: Requirement 9 (payload mínimo + forma idéntica en ambos caminos).
 * Ref design: §5 (firma), D4, D5 (tenantId = clienteId).
 * Tarea: 1.6 (PR1, notif-email-estado-ticket), 4.14 (PR4, enriquecimiento).
 */
export class TicketEstadoCambiado implements DomainEvent {
  readonly eventName = TICKET_ESTADO_CAMBIADO;

  constructor(
    readonly ticketId: string,
    readonly numero: string,
    readonly tituloTicket: string,
    readonly tipoCodigo: string,
    readonly estadoAnteriorId: string,
    readonly estadoNuevoId: string,
    readonly estadoAnteriorCodigo: string,
    readonly estadoNuevoCodigo: string,
    readonly solicitanteId: string,
    readonly autorId: string,
    readonly tenantId: string,
    readonly occurredAt: Date,
  ) {}
}
