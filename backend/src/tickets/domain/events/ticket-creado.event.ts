import { DomainEvent } from '../../../shared/domain/ports/i-domain-event-publisher';

/**
 * TicketCreadoEvent — evento de dominio emitido POST-COMMIT al crear un
 * ticket (Fase 4, S2 — GATE G3, aditivo sobre Fase 2). Consumido por el
 * módulo SLA (`AplicarSlaUseCase`) para calcular `sla_vence_at` a partir de
 * la prioridad y la fecha de creación.
 *
 * Sin PII: solo transporta identificadores técnicos (UUIDs) — mismo
 * criterio que `TicketEstadoCambiadoEvent`/`TicketComentadoEvent` (ADR-6).
 *
 * Ref spec: sdd/premium/spec S2. Ref design: ADR-P2. Tarea: SA10/SA11.
 */
export class TicketCreadoEvent implements DomainEvent {
  readonly name = 'ticket.creado';
  readonly occurredAt: Date;
  readonly ticketId: string;
  readonly prioridadId: string;

  constructor(props: { ticketId: string; prioridadId: string; occurredAt?: Date }) {
    this.ticketId = props.ticketId;
    this.prioridadId = props.prioridadId;
    this.occurredAt = props.occurredAt ?? new Date();
  }
}
