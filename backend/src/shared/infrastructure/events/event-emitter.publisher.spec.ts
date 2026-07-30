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

    // 4.12 (PR4) — R6 Scenario "`.emit()` no bloquea la respuesta HTTP del
    // endpoint de transición": con un EventEmitter2 REAL (no mock) y un
    // listener async deliberadamente lento, publish() debe retornar sin
    // esperar a que el listener complete. Ref design §8 (tabla testing R6).
    it('4.12 — con EventEmitter2 REAL y un listener async lento, publish() retorna sin esperar (R6 no bloquea)', async () => {
      const realEmitter = new EventEmitter2();
      const publisher = new EventEmitterPublisher(realEmitter);
      let listenerTerminado = false;
      realEmitter.on('fake.event.ocurrido', async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        listenerTerminado = true;
      });
      const event = new FakeEvent();

      const antes = Date.now();
      const result = publisher.publish(event);
      const transcurrido = Date.now() - antes;

      // publish() retornó sincrónicamente — no esperó los 50ms del listener.
      expect(result).toBeUndefined();
      expect(transcurrido).toBeLessThan(20);
      expect(listenerTerminado).toBe(false);

      // El listener eventualmente completa (fire-and-forget, no se pierde).
      await new Promise((resolve) => setTimeout(resolve, 80));
      expect(listenerTerminado).toBe(true);
    });
  });
});
