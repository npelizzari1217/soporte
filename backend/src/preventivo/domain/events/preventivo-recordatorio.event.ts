import { DomainEvent } from '../../../shared/domain/ports/i-domain-event-publisher';

/**
 * PreventivoRecordatorioEvent — el barrido diario reclamó el recordatorio de un ticket preventivo
 * cuya fecha objetivo es mañana (odd/preventivo-anticipacion S4). Se publica POST-COMMIT, después de
 * marcar `tickets.recordatorio_enviado_at` en la misma transacción del reclamo: si el commit falla no
 * sale, y un segundo barrido ya no lo encuentra.
 *
 * Sin PII: solo identificadores técnicos, mismo criterio que `PreventivoGeneradoEvent`.
 */
export class PreventivoRecordatorioEvent implements DomainEvent {
  readonly name = 'preventivo.recordatorio';
  readonly occurredAt: Date;
  readonly planId: string;
  readonly ticketId: string;
  /** Responsable ACTUAL del plan: el único destinatario del recordatorio (S4). */
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
