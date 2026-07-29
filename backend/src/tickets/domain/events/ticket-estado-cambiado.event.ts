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
 * Ref spec: Requirement 9 (payload mínimo + forma idéntica en ambos caminos).
 * Ref design: §5 (firma), D4, D5 (tenantId = clienteId).
 * Tarea: 1.6 (PR1, notif-email-estado-ticket)
 */
export class TicketEstadoCambiado implements DomainEvent {
  readonly eventName = TICKET_ESTADO_CAMBIADO;

  constructor(
    readonly ticketId: string,
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
