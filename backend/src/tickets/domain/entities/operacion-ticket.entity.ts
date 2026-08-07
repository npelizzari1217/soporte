import { BaseEntity } from '../../../shared/domain/base-entity';

/**
 * OperacionTicketProps — shape completo de las propiedades de un evento de
 * timeline (usado por getters y `reconstitute`). Sin imports de Prisma ni
 * NestJS — dominio puro.
 *
 * Nota sobre soft refs: `autorId` es UUID de master.usuarios, sin FK
 * cross-DB.
 */
export interface OperacionTicketProps {
  /** UUID del ticket al que pertenece este evento (FK → tickets). */
  ticketId: string;
  /** UUID del tipo de operación (FK → tipo_operacion). */
  tipoOperacionId: string;
  /** Descripción libre del evento (nullable). */
  descripcion: string | null;
  /** UUID del estado anterior (nullable — null en la operación de apertura). */
  estadoAnteriorId: string | null;
  /** UUID del estado nuevo (nullable — null si no es un cambio de estado). */
  estadoNuevoId: string | null;
  /** Soft ref → master.usuarios.id. */
  autorId: string;
  /**
   * `true` = nota interna (visible solo para staff con `ticket:observar`).
   * `false` = pública (visible también para el solicitante). Default
   * `false` en `create()` (T16).
   */
  esInterno: boolean;
  /** Datos adicionales estructurados del evento (ej. { porcentajeAvance: 75 }). */
  metadata: Record<string, unknown> | null;
}

/**
 * CrearOperacionTicketProps — props aceptadas por `create()`. `esInterno`
 * es opcional; si se omite, `create()` lo setea en `false` (T16 — un
 * comentario es público salvo que se marque interno explícitamente).
 */
export type CrearOperacionTicketProps = Omit<OperacionTicketProps, 'esInterno'> & {
  esInterno?: boolean;
};

/**
 * OperacionTicketEntity — registro inmutable del timeline de un ticket.
 *
 * Cada acción significativa sobre un ticket (cambio de estado, comentario,
 * asignación, adjunto) DEBE registrarse acá dentro de la misma transacción
 * que el cambio principal (T12, T24).
 *
 * INMUTABILIDAD: una vez creada, la operación no puede modificarse. No
 * existen mutadores de negocio: solo `softDelete()` heredado de
 * `BaseEntity` (auditoría/corrección excepcional).
 *
 * Ref spec: sdd/tickets-core/spec T12, T16, T17, T18. Tarea: T3.5.
 */
export class OperacionTicketEntity extends BaseEntity<OperacionTicketProps> {
  /**
   * Factory method para nuevas instancias de dominio. `esInterno` default
   * `false` si no se provee.
   */
  static create(props: CrearOperacionTicketProps, id?: string): OperacionTicketEntity {
    return new OperacionTicketEntity({ ...props, esInterno: props.esInterno ?? false }, id);
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
    Object.assign(entity, { _createdAt: createdAt, _updatedAt: updatedAt });
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

  get esInterno(): boolean {
    return this.props.esInterno;
  }

  get metadata(): Record<string, unknown> | null {
    return this.props.metadata;
  }

  // NOTA: sin setters — el registro de timeline es intencionalmente
  // inmutable, salvo softDelete() (heredado de BaseEntity).
}
