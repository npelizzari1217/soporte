import { DomainEvent } from '../../../shared/domain/ports/i-domain-event-publisher';

/**
 * TicketEstadoModificadoEvent — emitido POST-COMMIT cada vez que un ticket ya existente cambia de
 * estado, por cualquier camino (transición, asignación, tareas, corrección). Lo publica
 * `TicketRepositoryConTramos.save`, por donde pasan todas las escrituras del estado.
 *
 * A diferencia de `ticket.estado_cambiado`, que solo sale hacia los estados que avisan por correo,
 * este cubre todos: es el que alimenta el webhook "Cambio de estado"
 * (odd/tasks/defectos-ayuda.md, S6). Solo ids, sin PII.
 */
export class TicketEstadoModificadoEvent implements DomainEvent {
  readonly name = 'ticket.estado_modificado';
  readonly occurredAt: Date;
  readonly ticketId: string;

  constructor(props: { ticketId: string; occurredAt?: Date }) {
    this.ticketId = props.ticketId;
    this.occurredAt = props.occurredAt ?? new Date();
  }
}
