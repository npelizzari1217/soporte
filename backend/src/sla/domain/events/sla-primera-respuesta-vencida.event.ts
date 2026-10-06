import { DomainEvent } from '../../../shared/domain/ports/i-domain-event-publisher';

/**
 * SlaPrimeraRespuestaVencidaEvent — emitido por el barrido (`MarcarVencidosUseCase`, paso 3) cuando
 * un ticket sigue sin respuesta pasada su meta de primera respuesta (`sla-primera-respuesta` R4).
 * Se publica una sola vez por ticket: el CAS sobre `primeraRespuestaVencida=false` lo deduplica.
 *
 * Sin PII: solo identificadores técnicos (ADR-6).
 */
export class SlaPrimeraRespuestaVencidaEvent implements DomainEvent {
  readonly name = 'sla.primera_respuesta_vencida';
  readonly occurredAt: Date;
  readonly ticketId: string;
  readonly asignadoId: string | null;
  readonly solicitanteId: string | null;

  constructor(props: {
    ticketId: string;
    asignadoId: string | null;
    solicitanteId: string | null;
    occurredAt?: Date;
  }) {
    this.ticketId = props.ticketId;
    this.asignadoId = props.asignadoId;
    this.solicitanteId = props.solicitanteId;
    this.occurredAt = props.occurredAt ?? new Date();
  }
}
