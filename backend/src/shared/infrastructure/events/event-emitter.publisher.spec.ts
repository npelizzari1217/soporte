import { EventEmitter2 } from '@nestjs/event-emitter';
import { EventEmitterPublisher } from './event-emitter.publisher';
import { DomainEvent } from '../../domain/domain-event';

/**
 * 1.2 — RED: EventEmitterPublisher.publish() delega en EventEmitter2.emit()
 *
 * Ref design: D1, D10 (fire-and-forget — emit(), no emitAsync).
 * Ref tasks: PR1 1.2
 */

class FakeEvent implements DomainEvent {
  readonly eventName = 'fake.event.ocurrido';
  readonly occurredAt = new Date('2026-07-29T00:00:00.000Z');
}

describe('EventEmitterPublisher', () => {
  describe('publish()', () => {
    it('llama a emitter.emit(eventName, event) con el evento recibido', () => {
      const emitter = { emit: vi.fn() } as unknown as EventEmitter2;
      const publisher = new EventEmitterPublisher(emitter);
      const event = new FakeEvent();

      publisher.publish(event);

      expect(emitter.emit).toHaveBeenCalledTimes(1);
      expect(emitter.emit).toHaveBeenCalledWith(event.eventName, event);
    });

    it('no espera (no usa emitAsync) — publish() retorna void sincrónicamente', () => {
      const emitter = { emit: vi.fn() } as unknown as EventEmitter2;
      const publisher = new EventEmitterPublisher(emitter);
      const event = new FakeEvent();

      const result = publisher.publish(event);

      expect(result).toBeUndefined();
    });
  });
});
