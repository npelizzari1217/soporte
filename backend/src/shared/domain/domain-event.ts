/**
 * DomainEvent — contrato mínimo para eventos de dominio publicados vía
 * IDomainEventPublisher. Marker interface: solo exige el nombre del evento
 * (usado como topic de EventEmitter2) y el momento en que ocurrió el hecho
 * de negocio (NO el momento de publicación).
 *
 * domain/ no importa nada de frameworks — @nestjs/event-emitter vive
 * exclusivamente en el adapter de infra (event-emitter.publisher.ts).
 *
 * Ref design: design.md §5 (Interfaces / Contracts).
 * Tarea: 1.3 (PR1, notif-email-estado-ticket)
 */
export interface DomainEvent {
  readonly eventName: string;
  readonly occurredAt: Date;
}
