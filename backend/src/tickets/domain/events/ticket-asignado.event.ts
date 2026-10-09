import { DomainEvent } from '../../../shared/domain/ports/i-domain-event-publisher';

export type OrigenAsignacion = 'REGLA_TIPO' | 'MANUAL';

/**
 * TicketAsignadoEvent — emitido POST-COMMIT (siempre vía `alCommitear`) cuando un ticket queda
 * asignado, por la regla del tipo o a mano. Solo ids y origen, sin PII; `autorId` es `null` en
 * `REGLA_TIPO`. Ref design: asignacion-automatica-por-tipo ADR-7.
 */
export class TicketAsignadoEvent implements DomainEvent {
  readonly name = 'ticket.asignado';
  readonly occurredAt: Date;
  readonly ticketId: string;
  readonly asignadoId: string;
  readonly origen: OrigenAsignacion;
  readonly autorId: string | null;

  constructor(props: {
    ticketId: string;
    asignadoId: string;
    origen: OrigenAsignacion;
    autorId: string | null;
    occurredAt?: Date;
  }) {
    this.ticketId = props.ticketId;
    this.asignadoId = props.asignadoId;
    this.origen = props.origen;
    this.autorId = props.autorId;
    this.occurredAt = props.occurredAt ?? new Date();
  }
}
