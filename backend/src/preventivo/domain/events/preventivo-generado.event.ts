import { DomainEvent } from '../../../shared/domain/ports/i-domain-event-publisher';

/**
 * PreventivoGeneradoEvent — evento de dominio emitido cuando el barrido
 * (`GenerarPreventivosUseCase`, WU-5) genera un ticket `MANTENIMIENTO`
 * desde un plan vencido ([R11]). Publicado POST-COMMIT, log-and-swallow —
 * mismo patrón que `SlaVencidoEvent` (ADR-6). NUNCA se emite en
 * `SALTEADO_PENDIENTE` ni `SALTEADO_ATRASO`: solo cuando el ciclo produjo
 * ticket.
 *
 * Sin PII: solo transporta identificadores técnicos (UUIDs), mismo
 * criterio que el resto de los eventos de dominio del sistema (ADR-6).
 *
 * Ref spec: sdd/preventivo/spec, Requirement "Notificación solo al
 * generar". Ref design: ADR-PV2 (flujo de datos), flujo de datos. Tarea: 3.6.
 */
export class PreventivoGeneradoEvent implements DomainEvent {
  readonly name = 'preventivo.generado';
  readonly occurredAt: Date;
  readonly planId: string;
  readonly ticketId: string;
  /** Solicitante/autor del ticket generado (`plan.responsableId`) — destinatario de la notificación (WU-6). */
  readonly responsableId: string;

  constructor(props: {
    planId: string;
    ticketId: string;
    responsableId: string;
    occurredAt?: Date;
  }) {
    this.planId = props.planId;
    this.ticketId = props.ticketId;
    this.responsableId = props.responsableId;
    this.occurredAt = props.occurredAt ?? new Date();
  }
}
