import { DomainEvent } from '../../../shared/domain/ports/i-domain-event-publisher';

/**
 * TicketComentadoEvent — evento de dominio emitido POST-persist cuando se
 * crea un comentario PÚBLICO (`esInterno=false`) en el timeline de un
 * ticket (T16). Los comentarios INTERNOS (`esInterno=true`, T17) NUNCA
 * emiten este evento — no deben notificar al solicitante.
 *
 * Sin PII: solo transporta identificadores técnicos (UUIDs) — nunca el
 * texto del comentario ni datos de contacto. El listener de notificación
 * (Fase 4) resuelve email/nombre a partir de `ticketId`/`autorId` en su
 * propio boundary.
 *
 * Ref spec: sdd/tickets-core/spec T16. Ref design: ADR-6. Tarea: T9.1.
 */
export class TicketComentadoEvent implements DomainEvent {
  readonly name = 'ticket.comentado';
  readonly occurredAt: Date;
  readonly ticketId: string;
  readonly operacionId: string;
  readonly autorId: string;

  constructor(props: {
    ticketId: string;
    operacionId: string;
    autorId: string;
    occurredAt?: Date;
  }) {
    this.ticketId = props.ticketId;
    this.operacionId = props.operacionId;
    this.autorId = props.autorId;
    this.occurredAt = props.occurredAt ?? new Date();
  }
}
