import { BaseEntity } from '../../../shared/domain/base-entity';

/**
 * TicketEdiliciaProps — shape de las propiedades del satélite de reparaciones edilicias.
 *
 * Entidad 1:1 con Ticket para tickets de tipo EDILICIA.
 * El porcentaje de avance se recalcula en cada mutación de subtarea y se persiste.
 *
 * NORMALIZADO: guarda IDs (personal_asignado_id es soft ref cross-DB a master.usuarios).
 * Sin imports de Prisma ni NestJS — dominio puro.
 *
 * Ref spec: [SPEC:reparaciones/Tabla ticket_edilicia]
 * Tarea: 5.A.2
 */
export interface TicketEdiliciaProps {
  /** UUID del ticket base (FK → tickets.id). Relación 1:1. */
  ticketId: string;
  /** UUID de la ubicación donde ocurre la reparación (FK → ubicaciones.id). */
  ubicacionId: string;
  /**
   * Soft ref → master.usuarios.id. Técnico de mantenimiento ejecutor.
   * Puede diferir del tickets.asignado_id (que puede ser el supervisor).
   * NULL hasta que se asigne personal específico.
   */
  personalAsignadoId: string | null;
  /**
   * Porcentaje de avance derivado de las subtareas edilicias.
   * Valor NUMERIC(5,2): 0.00 a 100.00.
   * Recalculado por la app en cada mutación de subtarea — no es un trigger DB.
   * CHECK: 0 ≤ porcentajeAvance ≤ 100.
   */
  porcentajeAvance: number;
}

/**
 * TicketEdiliciaEntity — satélite 1:1 del ticket para el flujo EDILICIA.
 *
 * Agrega información específica de reparaciones edilicias:
 * - Ubicación física donde ocurre la reparación.
 * - Personal de mantenimiento asignado (soft ref).
 * - Porcentaje de avance derivado de subtareas (0.00 - 100.00).
 *
 * Reglas de dominio:
 * - Al crear: porcentajeAvance = 0. personalAsignadoId = null.
 * - actualizarAvance(): recibe el nuevo porcentaje calculado por AvanceCalculator.
 * - La transición a RESUELTO solo es válida cuando porcentajeAvance = 100
 *   (evaluada por EdiliciaStateMachine, no por esta entidad).
 * - Completar la última subtarea NO transiciona automáticamente el ticket.
 *
 * Ref spec: [SPEC:reparaciones/Tabla ticket_edilicia, Guard de avance en transición a RESUELTO]
 * Tarea: 5.A.2
 */
export class TicketEdiliciaEntity extends BaseEntity<TicketEdiliciaProps> {
  /**
   * Factory method para una nueva instancia de ticket_edilicia.
   * porcentajeAvance comienza en 0; personalAsignadoId en null.
   *
   * @param ticketId    UUID del ticket base al que pertenece.
   * @param ubicacionId UUID de la ubicación física de la reparación.
   * @param id          UUID opcional. Si no se provee, se genera un UUIDv7 nuevo.
   */
  static create(ticketId: string, ubicacionId: string, id?: string): TicketEdiliciaEntity {
    return new TicketEdiliciaEntity(
      {
        ticketId,
        ubicacionId,
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
    (entity as any)._createdAt = createdAt;
    (entity as any)._updatedAt = updatedAt;
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
   * Actualiza el porcentaje de avance derivado de subtareas.
   *
   * Llamado por los use cases (CrearSubtareaUseCase, CompletarSubtareaUseCase)
   * después de recalcular con AvanceCalculator. El nuevo valor debe estar
   * en el rango [0, 100].
   *
   * @param nuevoAvance Nuevo porcentaje calculado (0.00 - 100.00).
   */
  actualizarAvance(nuevoAvance: number): void {
    this.props.porcentajeAvance = nuevoAvance;
  }

  /**
   * Asigna el personal de mantenimiento ejecutor de la reparación.
   *
   * El personalAsignadoId es un soft ref cross-DB a master.usuarios.
   * La validación de existencia y pertenencia al tenant es responsabilidad
   * del use case correspondiente.
   *
   * @param personalId UUID del usuario técnico de mantenimiento.
   */
  asignarPersonal(personalId: string): void {
    this.props.personalAsignadoId = personalId;
  }
}
