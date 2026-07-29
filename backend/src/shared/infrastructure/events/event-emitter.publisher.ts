import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { IDomainEventPublisher } from '../../domain/ports/i-domain-event-publisher';
import { DomainEvent } from '../../domain/domain-event';

/**
 * EventEmitterPublisher — implementación de IDomainEventPublisher sobre
 * EventEmitter2 (in-process, MVP — sin outbox ni cola externa).
 *
 * Fire-and-forget (D10): usa `emitter.emit()` (sincrónico, no espera
 * listeners), NUNCA `emitAsync()`. Esto garantiza que publicar un evento
 * no bloquea al caller ni la respuesta HTTP del request en curso.
 *
 * Ref design: D1, D10.
 * Tarea: 1.3 (PR1, notif-email-estado-ticket)
 */
@Injectable()
export class EventEmitterPublisher implements IDomainEventPublisher {
  constructor(private readonly emitter: EventEmitter2) {}

  publish(event: DomainEvent): void {
    this.emitter.emit(event.eventName, event);
  }
}
