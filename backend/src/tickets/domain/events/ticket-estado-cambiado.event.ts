import { DomainEvent } from '../../../shared/domain/ports/i-domain-event-publisher';

/**
 * TicketEstadoCambiadoEvent — evento de dominio emitido POST-COMMIT cuando
 * una transición de estado alcanza un destino notificable (`RESUELTO`,
 * `CERRADO` — `estados-notificables.policy`, T13).
 *
 * Sin PII: solo transporta identificadores técnicos (UUIDs) y códigos de
 * estado — nunca email/nombre. El listener de notificación (Fase 4) es
 * responsable de resolver los datos de contacto a partir de `ticketId`/
 * `autorId` en su propio boundary.
 *
 * Ref spec: sdd/tickets-core/spec T13. Ref design: ADR-6. Tarea: T7.3.
 */
export class TicketEstadoCambiadoEvent implements DomainEvent {
  readonly name = 'ticket.estado_cambiado';
  readonly occurredAt: Date;
  readonly ticketId: string;
  readonly estadoAnteriorCodigo: string;
  readonly estadoNuevoCodigo: string;
  readonly autorId: string;

  constructor(props: {
    ticketId: string;
    estadoAnteriorCodigo: string;
    estadoNuevoCodigo: string;
    autorId: string;
    occurredAt?: Date;
  }) {
    this.ticketId = props.ticketId;
    this.estadoAnteriorCodigo = props.estadoAnteriorCodigo;
    this.estadoNuevoCodigo = props.estadoNuevoCodigo;
    this.autorId = props.autorId;
    this.occurredAt = props.occurredAt ?? new Date();
  }
}
