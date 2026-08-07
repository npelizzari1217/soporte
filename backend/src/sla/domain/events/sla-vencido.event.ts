import { DomainEvent } from '../../../shared/domain/ports/i-domain-event-publisher';

/**
 * SlaVencidoEvent — evento de dominio emitido cuando el barrido periódico
 * (`SlaSweepScheduler`/`MarcarVencidosUseCase`) marca `vencido=true` en un
 * ticket cuyo `sla_vence_at` pasó (S4). Consumido por el módulo
 * Notificaciones (PR-N, fuera de este alcance) para notificar al asignado +
 * administradores del tenant.
 *
 * Sin PII: solo transporta identificadores técnicos (UUIDs) — mismo
 * criterio que el resto de los eventos de dominio del sistema (ADR-6).
 *
 * Ref spec: sdd/premium/spec S4. Ref design: ADR-P4 (firma). Tarea: SB1/SB2.
 */
export class SlaVencidoEvent implements DomainEvent {
  readonly name = 'sla.vencido';
  readonly occurredAt: Date;
  readonly ticketId: string;
  readonly asignadoId: string | null;
  readonly solicitanteId: string;

  constructor(props: {
    ticketId: string;
    asignadoId: string | null;
    solicitanteId: string;
    occurredAt?: Date;
  }) {
    this.ticketId = props.ticketId;
    this.asignadoId = props.asignadoId;
    this.solicitanteId = props.solicitanteId;
    this.occurredAt = props.occurredAt ?? new Date();
  }
}
