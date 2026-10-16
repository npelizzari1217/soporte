/**
 * event-emitter2-domain-event-publisher.spec.ts — TDD RED phase (T1.2, PR1
 * tickets-core).
 *
 * Ref design: ADR-6 (eventos de dominio POST-COMMIT, log-and-swallow).
 * Ref tasks: sdd/tickets-core/tasks PR1 T1.2.
 */
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EventEmitter2DomainEventPublisher } from './event-emitter2-domain-event-publisher';
import { DomainEvent } from '../../domain/ports/i-domain-event-publisher';

class FakeEvent implements DomainEvent {
  readonly name = 'fake.event.ocurrido';
  readonly occurredAt = new Date('2026-08-06T00:00:00.000Z');
}

describe('EventEmitter2DomainEventPublisher', () => {
  describe('publish()', () => {
    it('delega en emitter.emit(event.name, event)', () => {
      const emitter = new EventEmitter2();
      vi.spyOn(emitter, 'emit').mockReturnValue(true);
      const publisher = new EventEmitter2DomainEventPublisher(emitter);
      const event = new FakeEvent();

      publisher.publish(event);

      expect(emitter.emit).toHaveBeenCalledTimes(1);
      expect(emitter.emit).toHaveBeenCalledWith(event.name, event);
    });

    it('retorna void sincrónicamente (no usa emitAsync)', () => {
      const emitter = new EventEmitter2();
      vi.spyOn(emitter, 'emit').mockReturnValue(true);
      const publisher = new EventEmitter2DomainEventPublisher(emitter);

      const result = publisher.publish(new FakeEvent());

      expect(result).toBeUndefined();
    });

    it('no lanza si el emitter lanza — aislado del caller (log-and-swallow, ADR-6)', () => {
      const emitter = new EventEmitter2();
      vi.spyOn(emitter, 'emit').mockImplementation(() => {
        throw new Error('listener explotó');
      });
      const publisher = new EventEmitter2DomainEventPublisher(emitter);

      expect(() => publisher.publish(new FakeEvent())).not.toThrow();
    });
  });
});
