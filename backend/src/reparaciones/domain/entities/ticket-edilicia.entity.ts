import { BaseEntity } from '../../../shared/domain/base-entity';

/**
 * TicketEdiliciaProps — shape de las propiedades del satélite de reparaciones
 * edilicias. Satélite 1:0..1 de `Ticket` (Fase 2) para tickets de tipo
 * EDILICIA. Sin imports de Prisma ni NestJS — dominio puro.
 *
 * El avance ya no vive acá: se calcula al leer sobre las tareas del ticket
 * (`calcularAvanceTareas`). `personalAsignadoId` y `porcentajeAvance` se
 * retiraron en odd/tareas-con-tecnico T8.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-E1, F3-E3, F3-E4. Ref design:
 * "Firmas TS clave" (TicketEdiliciaEntity). Tarea: T6.3.
 */
export interface TicketEdiliciaProps {
  /** UUID del ticket base (FK → tickets.id). Relación 1:0..1. */
  ticketId: string;
  /**
   * Ubicación del ticket base (`tickets.ubicacion`), de solo lectura. Desde odd/ticket-unificado
   * (S1) la ubicación es una sola y es del ticket: el satélite ya no guarda una propia, y el mapper
   * la lee del ticket para quien todavía la consume desde acá (el PDF).
   */
  ubicacion: string | null;
}

/**
 * TicketEdiliciaEntity — satélite 1:0..1 del ticket para el flujo EDILICIA.
 *
 * Reglas de dominio (F3-E1):
 * - Este satélite no decide el estado del ticket. El ADR-2 original ("completar la
 *   última tarea NO resuelve el ticket") quedó revertido el 2026-10-16 por decisión
 *   del dueño (odd/estado-por-tareas): ahora el estado sigue a las tareas, para todo
 *   tipo de ticket, desde el núcleo de tickets (`estado-por-tareas.policy.ts`), sin
 *   acoplar el core a este satélite.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-E1, F3-E3, F3-E4. Ref design:
 * ADR-2, "Firmas TS clave" (TicketEdiliciaEntity). Tarea: T6.3.
 */
export class TicketEdiliciaEntity extends BaseEntity<TicketEdiliciaProps> {
  private constructor(props: TicketEdiliciaProps, id?: string) {
    super(props, id);
  }

  /**
   * Factory method para una nueva instancia de `ticket_edilicia`. Nace sin ubicación propia: la
   * ubicación se carga en el ticket (odd/ticket-unificado).
   *
   * @param props `ticketId` del ticket base.
   * @param id    UUID opcional. Si no se provee, se genera un UUIDv7 nuevo.
   * @returns El satélite nuevo.
   */
  static create(props: { ticketId: string }, id?: string): TicketEdiliciaEntity {
    return new TicketEdiliciaEntity({ ticketId: props.ticketId, ubicacion: null }, id);
  }

  /**
   * Reconstitución desde persistencia (mappers de infraestructura).
   */
  static reconstitute(
    props: TicketEdiliciaProps,
    id: string,
    createdAt: Date,
    updatedAt: Date,
    deletedAt: Date | null,
  ): TicketEdiliciaEntity {
    const entity = new TicketEdiliciaEntity(props, id);
    Object.assign(entity, { _createdAt: createdAt, _updatedAt: updatedAt });
    entity._deletedAt = deletedAt;
    return entity;
  }

  // ─── Getters ─────────────────────────────────────────────────────────────

  get ticketId(): string {
    return this.props.ticketId;
  }

  get ubicacion(): string | null {
    return this.props.ubicacion;
  }
}
