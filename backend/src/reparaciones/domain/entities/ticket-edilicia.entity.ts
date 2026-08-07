import { BaseEntity } from '../../../shared/domain/base-entity';

/**
 * TicketEdiliciaProps — shape de las propiedades del satélite de reparaciones
 * edilicias. Satélite 1:0..1 de `Ticket` (Fase 2) para tickets de tipo
 * EDILICIA. El porcentaje de avance se recalcula (`AvanceCalculator`) en
 * cada mutación de subtarea y se persiste.
 *
 * NORMALIZADO: guarda IDs (`personalAsignadoId` es soft ref cross-DB a
 * master.usuarios, sin FK). Sin imports de Prisma ni NestJS — dominio puro.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-E1, F3-E3, F3-E4. Ref design:
 * "Firmas TS clave" (TicketEdiliciaEntity). Tarea: T6.3.
 */
export interface TicketEdiliciaProps {
  /** UUID del ticket base (FK → tickets.id). Relación 1:0..1. */
  ticketId: string;
  /** UUID de la ubicación donde ocurre la reparación (FK → ubicaciones.id). */
  ubicacionId: string;
  /** Soft ref → master.usuarios.id. NULL hasta que se asigne personal específico. */
  personalAsignadoId: string | null;
  /** Porcentaje de avance derivado de las subtareas activas (0.00 - 100.00). */
  porcentajeAvance: number;
}

/**
 * TicketEdiliciaEntity — satélite 1:0..1 del ticket para el flujo EDILICIA.
 *
 * Reglas de dominio (F3-E1):
 * - Al crear: porcentajeAvance = 0, personalAsignadoId = null.
 * - actualizarAvance(): recibe el nuevo porcentaje calculado por
 *   `AvanceCalculator` (llamado por `CrearSubtareaUseCase`/
 *   `CompletarSubtareaUseCase`/`EliminarSubtareaUseCase`).
 * - Completar la última subtarea (avance→100) NO transiciona el ticket a
 *   RESUELTO automáticamente (ADR-2, decisión deliberada — sin máquina
 *   custom que acople el core a este satélite).
 *
 * Ref spec: sdd/flujos-especializados/spec F3-E1, F3-E3, F3-E4. Ref design:
 * ADR-2, "Firmas TS clave" (TicketEdiliciaEntity). Tarea: T6.3.
 */
export class TicketEdiliciaEntity extends BaseEntity<TicketEdiliciaProps> {
  private constructor(props: TicketEdiliciaProps, id?: string) {
    super(props, id);
  }

  /**
   * Factory method para una nueva instancia de `ticket_edilicia`.
   * `porcentajeAvance` comienza en 0; `personalAsignadoId` en `null`.
   *
   * @param props Solo `ticketId`/`ubicacionId` — el resto son invariantes de creación.
   * @param id    UUID opcional. Si no se provee, se genera un UUIDv7 nuevo.
   */
  static create(
    props: { ticketId: string; ubicacionId: string },
    id?: string,
  ): TicketEdiliciaEntity {
    return new TicketEdiliciaEntity(
      {
        ticketId: props.ticketId,
        ubicacionId: props.ubicacionId,
        personalAsignadoId: null,
        porcentajeAvance: 0,
      },
      id,
    );
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

  get ubicacionId(): string {
    return this.props.ubicacionId;
  }

  get personalAsignadoId(): string | null {
    return this.props.personalAsignadoId;
  }

  get porcentajeAvance(): number {
    return this.props.porcentajeAvance;
  }

  // ─── Comportamiento de dominio ─────────────────────────────────────────

  /**
   * Actualiza el porcentaje de avance derivado de subtareas. Llamado por
   * los use cases DESPUÉS de recalcular con `AvanceCalculator`.
   *
   * @param nuevoAvance Nuevo porcentaje calculado (0.00 - 100.00).
   */
  actualizarAvance(nuevoAvance: number): void {
    this.props.porcentajeAvance = nuevoAvance;
    this.touch();
  }

  /**
   * Asigna (o desasigna, con `null`) el personal de mantenimiento ejecutor
   * de la reparación. La validación de existencia cross-DB es
   * responsabilidad del use case correspondiente.
   *
   * @param personalId UUID del usuario técnico de mantenimiento, o `null` para desasignar.
   */
  asignarPersonal(personalId: string | null): void {
    this.props.personalAsignadoId = personalId;
    this.touch();
  }
}
