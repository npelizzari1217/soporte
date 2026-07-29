import { DomainEvent } from '../domain-event';

/**
 * IDomainEventPublisher — puerto fino de publicación de eventos de dominio.
 *
 * Fire-and-forget por diseño (D10): `publish()` retorna `void`, no `Promise`.
 * El publisher NUNCA espera a que los listeners async terminen — así el
 * caller (un use case) no bloquea la respuesta HTTP publicando el evento.
 *
 * Las implementaciones concretas viven en infra:
 *   - EventEmitterPublisher — adapter sobre EventEmitter2 (in-process, MVP).
 *
 * Ref design: D1 — mismo patrón que ITenantTransactionRunner (port en shared/,
 * consumido por application/ vía token, implementado en infra/).
 * Tarea: 1.3 (PR1, notif-email-estado-ticket)
 */
export interface IDomainEventPublisher {
  publish(event: DomainEvent): void;
}

/** Token de inyección de dependencias para IDomainEventPublisher en NestJS. */
export const DOMAIN_EVENT_PUBLISHER = Symbol('DOMAIN_EVENT_PUBLISHER');
