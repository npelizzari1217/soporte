import { BaseEntity } from '../../../shared/domain/base-entity';

/**
 * OperacionTicketProps — shape de las propiedades de un evento de timeline.
 * Sin imports de Prisma ni NestJS — dominio puro.
 *
 * Nota sobre soft refs:
 * - autor_id es UUID de master.usuarios — sin FK cross-DB.
 */
export interface OperacionTicketProps {
  /** UUID del ticket al que pertenece este evento (FK → tickets). */
  ticketId: string;
  /** UUID del tipo de operación (FK → tipo_operacion). */
  tipoOperacionId: string;
  /** Descripción libre del evento (nullable). */
  descripcion: string | null;
  /** UUID del estado anterior (nullable — null para la operación inicial). */
  estadoAnteriorId: string | null;
  /** UUID del estado nuevo (nullable — null si no es cambio de estado). */
  estadoNuevoId: string | null;
  /** Soft ref → master.usuarios.id. */
  autorId: string;
  /** Datos adicionales estructurados del evento (ej. { porcentaje_avance: 75 }). */
  metadata: Record<string, unknown> | null;
}

/**
 * OperacionTicketEntity — registro inmutable del timeline de un ticket.
 *
 * Cada acción significativa sobre un ticket (cambio de estado, comentario,
 * asignación, adjunto, avance edilicio) DEBE registrarse aquí dentro de la
 * misma transacción que el cambio principal.
 *
 * INMUTABILIDAD: una vez creada, la operación no puede modificarse.
 * No existen métodos de mutación de negocio: solo se permite softDelete()
 * heredado de BaseEntity para auditoría.
 *
 * Ref spec: [SPEC:tickets-core/Tabla operaciones_ticket]
 * Tarea: 3.A.2
 */
export class OperacionTicketEntity extends BaseEntity<OperacionTicketProps> {
  /**
   * Factory method para nuevas instancias de dominio.
   * Genera UUIDv7 internamente (via BaseEntity) si no se provee id.
   */
  static create(props: OperacionTicketProps, id?: string): OperacionTicketEntity {
    return new OperacionTicketEntity(props, id);
  }

  /**
   * Reconstitución desde persistencia (mappers de infraestructura).
   */
  static reconstitute(
    props: OperacionTicketProps,
    id: string,
    createdAt: Date,
    updatedAt: Date,
    deletedAt: Date | null,
  ): OperacionTicketEntity {
    const entity = new OperacionTicketEntity(props, id);
    (entity as any)._createdAt = createdAt;
    (entity as any)._updatedAt = updatedAt;
    entity._deletedAt = deletedAt;
    return entity;
  }

  // ─── Getters (solo lectura — la entidad es inmutable) ────────────────────

  get ticketId(): string {
    return this.props.ticketId;
  }

  get tipoOperacionId(): string {
    return this.props.tipoOperacionId;
  }

  get descripcion(): string | null {
    return this.props.descripcion;
  }

  get estadoAnteriorId(): string | null {
    return this.props.estadoAnteriorId;
  }

  get estadoNuevoId(): string | null {
    return this.props.estadoNuevoId;
  }

  get autorId(): string {
    return this.props.autorId;
  }

  get metadata(): Record<string, unknown> | null {
    return this.props.metadata;
  }

  // NOTA: No hay métodos setDescripcion, setEstadoNuevoId, setMetadata, etc.
  // El registro de timeline es intencional e inmutablemente lo que fue grabado.
}
