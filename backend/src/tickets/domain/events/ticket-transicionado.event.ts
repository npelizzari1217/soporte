import { DomainEvent } from '../../../shared/domain/ports/i-domain-event-publisher';

/**
 * TicketTransicionadoEvent — emitido POST-COMMIT solo cuando la transicion afecta el reloj de SLA
 * (`afectaRelojSla`, ADR-3). Distinto de `TicketEstadoCambiadoEvent`, que es el de notificaciones.
 * Sin PII: solo ids y codigos.
 */
export class TicketTransicionadoEvent implements DomainEvent {
  readonly name = 'ticket.transicionado';
  readonly occurredAt: Date;
  readonly ticketId: string;
  readonly estadoAnteriorCodigo: string;
  readonly estadoNuevoCodigo: string;

  constructor(props: {
    ticketId: string;
    estadoAnteriorCodigo: string;
    estadoNuevoCodigo: string;
    occurredAt?: Date;
  }) {
    this.ticketId = props.ticketId;
    this.estadoAnteriorCodigo = props.estadoAnteriorCodigo;
    this.estadoNuevoCodigo = props.estadoNuevoCodigo;
    this.occurredAt = props.occurredAt ?? new Date();
  }
}
