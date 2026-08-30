import { BaseEntity } from '../../../shared/domain/base-entity';

/**
 * Tope de largo de `descripcion`, espejando
 * `subtareasEdilicia.descripcion VarChar(255) NOT NULL`
 * (`prisma_tenant/schema.prisma`).
 *
 * Misma autoridad y mismo criterio que `TICKET_EDILICIA_UBICACION_MAX_LENGTH`:
 * el número vive en el dominio, el DTO lo importa y el front lo espeja, así que
 * ninguna de las tres capas puede moverse sola.
 */
export const SUBTAREA_DESCRIPCION_MAX_LENGTH = 255;

/**
 * Precondición de largo de `descripcion`. `throw` plano (rama 1: el campo no se
 * normaliza en el borde). NO se aplica en `reconstitute()`, que lee sin
 * revalidar.
 */
function validarLargoDescripcion(descripcion: string): void {
  if (descripcion.length > SUBTAREA_DESCRIPCION_MAX_LENGTH) {
    throw new Error(
      `SubtareaEdiliciaEntity: descripcion excede ${SUBTAREA_DESCRIPCION_MAX_LENGTH} caracteres.`,
    );
  }
}

/**
 * SubtareaEdiliciaProps — shape de las propiedades de una subtarea edilicia
 * (checklist de avance de la reparación). Sin imports de Prisma ni NestJS —
 * dominio puro.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-E3, F3-E4, F3-E5. Tarea: T6.4.
 */
export interface SubtareaEdiliciaProps {
  /** UUID del `ticket_edilicia` al que pertenece esta subtarea. */
  ticketEdiliciaId: string;
  /** Descripción de la tarea concreta a realizar (VARCHAR 255). */
  descripcion: string;
  /** FALSE = pendiente; TRUE = completada. Default FALSE. */
  completada: boolean;
  /** Timestamp de cuándo se completó. NULL si no fue completada aún. */
  completadaEn: Date | null;
  /** Soft ref → master.usuarios.id. Quién completó la subtarea. NULL mientras no está completada. */
  completadaPorId: string | null;
  /** Orden de visualización en UI. Default 0. */
  orden: number;
}

/**
 * SubtareaEdiliciaEntity — entidad de dominio para subtareas de reparación
 * edilicia (checklist de avance).
 *
 * Reglas de dominio:
 * - Al crear: completada = false, completadaEn = null, completadaPorId = null.
 * - completar(): setea completada = true, completadaEn = ahora, completadaPorId = usuarioId.
 * - Soft delete: la subtarea deja de contar en el cálculo de avance
 *   (`AvanceCalculator` la excluye vía `deletedAt !== null`).
 *
 * Ref spec: sdd/flujos-especializados/spec F3-E3, F3-E4, F3-E5. Ref design:
 * "Firmas TS clave" (SubtareaEdiliciaEntity). Tarea: T6.4.
 */
export class SubtareaEdiliciaEntity extends BaseEntity<SubtareaEdiliciaProps> {
  private constructor(props: SubtareaEdiliciaProps, id?: string) {
    super(props, id);
  }

  /**
   * Factory method para una nueva subtarea.
   *
   * @param params.ticketEdiliciaId UUID del `ticket_edilicia` al que pertenece.
   * @param params.descripcion      Descripción de la tarea.
   * @param params.orden            Orden de visualización (default 0).
   * @param id                      UUID opcional. Si no se provee, se genera UUIDv7.
   */
  static create(
    params: { ticketEdiliciaId: string; descripcion: string; orden?: number },
    id?: string,
  ): SubtareaEdiliciaEntity {
    validarLargoDescripcion(params.descripcion);
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
    Object.assign(entity, { _createdAt: createdAt, _updatedAt: updatedAt });
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
   * Marca la subtarea como completada. El use case llama este método dentro
   * de la misma transacción que recalcula el avance del ticket edilicio y
   * registra la operación AVANCE_EDILICIO.
   *
   * Idempotente por diseño: no valida "ya completada" (el design de Fase 3
   * no define un error dedicado para doble-completado, a diferencia de
   * `TicketCompraEntity.aprobar`/`rechazar` — ADR-1). Volver a llamar
   * `completar()` simplemente actualiza `completadaEn`/`completadaPorId`.
   *
   * @param completadaPorId UUID del usuario que completa la subtarea (soft ref master.usuarios).
   * @param completadaEn    Timestamp de completitud. Defaults a now() si no se provee.
   */
  completar(completadaPorId: string, completadaEn?: Date): void {
    this.props.completada = true;
    this.props.completadaEn = completadaEn ?? new Date();
    this.props.completadaPorId = completadaPorId;
    this.touch();
  }
}
