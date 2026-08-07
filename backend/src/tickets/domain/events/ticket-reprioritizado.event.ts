import { DomainEvent } from '../../../shared/domain/ports/i-domain-event-publisher';

/**
 * TicketReprioritizadoEvent — evento de dominio emitido POST-COMMIT cuando
 * `EditarTicketUseCase` cambia la `prioridadId` de un ticket (Fase 4, S3 —
 * GATE G3, aditivo sobre Fase 2). Consumido por el módulo SLA
 * (`AplicarSlaUseCase`) para recalcular `sla_vence_at` desde el `createdAt`
 * ORIGINAL del ticket (ancla fija, S3 — nunca la fecha de repriorización).
 *
 * Sin PII: solo transporta identificadores técnicos (UUIDs) — mismo
 * criterio que el resto de los eventos de dominio de `tickets/` (ADR-6).
 *
 * Ref spec: sdd/premium/spec S3. Ref design: ADR-P2. Tarea: SA10/SA11.
 */
export class TicketReprioritizadoEvent implements DomainEvent {
  readonly name = 'ticket.reprioritizado';
  readonly occurredAt: Date;
  readonly ticketId: string;
  readonly prioridadId: string;

  constructor(props: { ticketId: string; prioridadId: string; occurredAt?: Date }) {
    this.ticketId = props.ticketId;
    this.prioridadId = props.prioridadId;
    this.occurredAt = props.occurredAt ?? new Date();
  }
}
