import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DomainEvent, IDomainEventPublisher } from '../../domain/ports/i-domain-event-publisher';

/**
 * EventEmitter2DomainEventPublisher — implementación de IDomainEventPublisher
 * sobre EventEmitter2 (in-process, sin outbox ni cola externa).
 *
 * Fire-and-forget (ADR-6): usa `emitter.emit()` (sincrónico, no espera
 * listeners), NUNCA `emitAsync()`. Publicar un evento no bloquea al caller
 * ni la respuesta HTTP del request en curso.
 *
 * Aislamiento del caller: si el emitter (o algún listener sincrónico) lanza,
 * `publish()` lo atrapa y lo swallowea — un fallo en la notificación NUNCA
 * debe revertir/afectar una transición/comentario ya committeado (T13, T16).
 * El envío real de email es Fase 4; acá sólo se emite el evento de dominio.
 *
 * Ref design: ADR-6. Ref tasks: sdd/tickets-core/tasks PR1 T1.2.
 */
@Injectable()
export class EventEmitter2DomainEventPublisher implements IDomainEventPublisher {
  constructor(private readonly emitter: EventEmitter2) {}

  publish(event: DomainEvent): void {
    try {
      this.emitter.emit(event.name, event);
    } catch {
      // log-and-swallow (ADR-6): un fallo al emitir/en un listener síncrono
      // NUNCA debe propagarse al caller (la mutación de dominio ya committeó).
      // Sin logger inyectado en este adapter fino — el listener real (Fase 4)
      // es responsable de loguear sus propios fallos.
    }
  }
}
