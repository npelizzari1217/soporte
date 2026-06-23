import { BaseEntity } from '../../../shared/domain/base-entity';

/**
 * SubtareaEdiliciaProps — shape de las propiedades de una subtarea edilicia.
 *
 * Modela los pasos concretos de una reparación edilicia.
 * Sin imports de Prisma ni NestJS — dominio puro.
 *
 * Ref spec: [SPEC:reparaciones/Tabla subtareas_edilicia]
 * Tarea: 5.A.2
 */
export interface SubtareaEdiliciaProps {
  /** UUID del ticket_edilicia al que pertenece esta subtarea. */
  ticketEdiliciaId: string;
  /** Descripción de la tarea concreta a realizar (VARCHAR 255). */
  descripcion: string;
  /** FALSE = pendiente; TRUE = completada. Default FALSE. */
  completada: boolean;
  /**
   * Timestamp de cuándo se completó. NULL si no fue completada aún.
   * Se setea en completar().
   */
  completadaEn: Date | null;
  /**
   * Soft ref → master.usuarios.id. Quién completó la subtarea.
   * NULL mientras no está completada.
   */
  completadaPorId: string | null;
  /** Orden de visualización en UI. Default 0. */
  orden: number;
}

/**
 * SubtareaEdiliciaEntity — entidad de dominio para subtareas de reparación edilicia.
 *
 * Representa un paso concreto de la reparación. El avance del ticket edilicio
 * es función del estado de sus subtareas activas.
 *
 * Reglas de dominio:
 * - Al crear: completada = false, completadaEn = null, completadaPorId = null.
 * - completar(): setea completada = true, completadaEn = ahora, completadaPorId = usuarioId.
 * - Soft delete: la subtarea deja de contar en el cálculo de avance.
 *   El use case recalcula el avance después del soft delete.
 *
 * Ref spec: [SPEC:reparaciones/Tabla subtareas_edilicia, Avance derivado de subtareas]
 * Tarea: 5.A.2
 */
export class SubtareaEdiliciaEntity extends BaseEntity<SubtareaEdiliciaProps> {
  /**
   * Factory method para una nueva subtarea.
   *
   * @param params.ticketEdiliciaId UUID del ticket_edilicia al que pertenece.
   * @param params.descripcion      Descripción de la tarea.
   * @param params.orden            Orden de visualización (default 0).
   * @param id                      UUID opcional. Si no se provee, se genera UUIDv7.
   */
  static create(
    params: { ticketEdiliciaId: string; descripcion: string; orden?: number },
    id?: string,
  ): SubtareaEdiliciaEntity {
    return new SubtareaEdiliciaEntity(
      {
        ticketEdiliciaId: params.ticketEdiliciaId,
        descripcion: params.descripcion,
        completada: false,
        completadaEn: null,
        completadaPorId: null,
        orden: params.orden ?? 0,
      },
      id,
    );
  }

  /**
   * Reconstitución desde persistencia (mappers de infraestructura).
   */
  static reconstitute(
    props: SubtareaEdiliciaProps,
    id: string,
    createdAt: Date,
    updatedAt: Date,
    deletedAt: Date | null,
  ): SubtareaEdiliciaEntity {
    const entity = new SubtareaEdiliciaEntity(props, id);
    (entity as any)._createdAt = createdAt;
    (entity as any)._updatedAt = updatedAt;
    entity._deletedAt = deletedAt;
    return entity;
  }

  // ─── Getters ─────────────────────────────────────────────────────────────

  get ticketEdiliciaId(): string {
    return this.props.ticketEdiliciaId;
  }

  get descripcion(): string {
    return this.props.descripcion;
  }

  get completada(): boolean {
    return this.props.completada;
  }

  get completadaEn(): Date | null {
    return this.props.completadaEn;
  }

  get completadaPorId(): string | null {
    return this.props.completadaPorId;
  }

  get orden(): number {
    return this.props.orden;
  }

  // ─── Comportamiento de dominio ─────────────────────────────────────────

  /**
   * Marca la subtarea como completada.
   *
   * Setea completada = true, completadaEn = ahora, completadaPorId = usuarioId.
   * El use case llama este método dentro de la misma transacción que recalcula
   * el avance del ticket edilicio y registra la operación AVANCE_EDILICIO.
   *
   * @param completadaPorId UUID del usuario que completa la subtarea (soft ref master.usuarios).
   * @param completadaEn    Timestamp de completitud. Defaults a now() si no se provee.
   */
  completar(completadaPorId: string, completadaEn?: Date): void {
    this.props.completada = true;
    this.props.completadaEn = completadaEn ?? new Date();
    this.props.completadaPorId = completadaPorId;
  }
}
