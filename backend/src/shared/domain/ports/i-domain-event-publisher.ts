/**
 * DomainEvent — contrato mínimo para eventos de dominio publicados vía
 * IDomainEventPublisher. Marker interface: solo exige el nombre del evento
 * (usado como topic de EventEmitter2) y el momento en que ocurrió el hecho
 * de negocio (NO el momento de publicación).
 *
 * domain/ no importa nada de frameworks — @nestjs/event-emitter vive
 * exclusivamente en el adapter de infra
 * (shared/infrastructure/events/event-emitter2-domain-event-publisher.ts).
 *
 * Ref design: ADR-6. Ref tasks: sdd/tickets-core/tasks PR1 T1.5.
 */
export interface DomainEvent {
  readonly name: string;
  readonly occurredAt: Date;
}

/**
 * IDomainEventPublisher — puerto fino de publicación de eventos de dominio.
 *
 * Fire-and-forget: `publish()` retorna `void`. Las implementaciones
 * concretas NUNCA deben propagar un fallo del transporte (ej. un listener
 * que lanza) hacia el caller — un use case que publica un evento POST-COMMIT
 * (T13, T16) no debe ver revertido su resultado por un error de notificación
 * (ADR-6: log-and-swallow, aislado del caller).
 *
 * Implementación concreta: EventEmitter2DomainEventPublisher (adapter sobre
 * EventEmitter2, in-process).
 */
export interface IDomainEventPublisher {
  publish(event: DomainEvent): void;
}

/** Token de inyección de dependencias para IDomainEventPublisher en NestJS. */
export const DOMAIN_EVENT_PUBLISHER = Symbol('DOMAIN_EVENT_PUBLISHER');
