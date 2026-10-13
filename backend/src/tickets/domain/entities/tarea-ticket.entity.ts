import { BaseEntity } from '../../../shared/domain/base-entity';
import { DomainError, Result } from '../../../shared/domain/result';
import {
  TareaEliminadaError,
  TareaNoCompletadaError,
  TareaYaCompletadaError,
} from '../errors/tareas.errors';

/**
 * Tope de largo de `descripcion`, espejando `tareas_ticket.descripcion VARCHAR(255) NOT NULL`
 * (`prisma_tenant/schema.prisma`).
 */
export const TAREA_DESCRIPCION_MAX_LENGTH = 255;

/**
 * Precondición de `descripcion`: no vacía y dentro del tope. `throw` plano, igual que en
 * `SubtareaEdiliciaEntity`: el DTO la valida en el borde, así que llegar acá con un valor inválido
 * es un error de programación. No se aplica en `reconstitute()`.
 */
function validarDescripcion(descripcion: string): void {
  if (descripcion.trim().length === 0) {
    throw new Error('TareaTicketEntity: descripcion vacía.');
  }
  if (descripcion.length > TAREA_DESCRIPCION_MAX_LENGTH) {
    throw new Error(
      `TareaTicketEntity: descripcion excede ${TAREA_DESCRIPCION_MAX_LENGTH} caracteres.`,
    );
  }
}

export interface TareaTicketProps {
  /** Ticket al que pertenece la tarea (FK real a `tickets.id`). */
  ticketId: string;
  descripcion: string;
  /** Orden de visualización. Las tareas no se reordenan después del alta. */
  orden: number;
  /** Soft ref → master.usuarios.id. NULL = tarea sin técnico. */
  tecnicoId: string | null;
  completada: boolean;
  /** NULL si y solo si `completada` es false (mismo invariante que el CHECK de la tabla). */
  completadaEn: Date | null;
  /** Soft ref → master.usuarios.id. NULL si y solo si `completada` es false. */
  completadaPorId: string | null;
}

/**
 * TareaTicketEntity — tarea de un ticket de cualquier tipo, con técnico opcional. El crédito de la
 * tarea es de quien la completó (`completadaPorId`).
 *
 * Invariante, espejo del CHECK `tareas_ticket_completada_check`: una tarea completada tiene
 * `completadaEn` y `completadaPorId`; una pendiente no tiene ninguno de los dos. Una tarea dada de
 * baja ya no cambia.
 *
 * Las reglas de quién puede hacer cada cosa viven en los casos de uso (T2), no acá.
 */
export class TareaTicketEntity extends BaseEntity<TareaTicketProps> {
  private constructor(props: TareaTicketProps, id?: string) {
    super(props, id);
  }

  /** Alta de una tarea pendiente. Sin `id` se genera un UUIDv7. */
  static crear(
    params: { ticketId: string; descripcion: string; orden: number; tecnicoId?: string | null },
    id?: string,
  ): TareaTicketEntity {
    validarDescripcion(params.descripcion);
    return new TareaTicketEntity(
      {
        ticketId: params.ticketId,
        descripcion: params.descripcion,
        orden: params.orden,
        tecnicoId: params.tecnicoId ?? null,
        completada: false,
        completadaEn: null,
        completadaPorId: null,
      },
      id,
    );
  }

  /** Reconstitución desde persistencia: no revalida, la fila ya pasó el CHECK. */
  static reconstitute(
    props: TareaTicketProps,
    id: string,
    createdAt: Date,
    updatedAt: Date,
    deletedAt: Date | null,
  ): TareaTicketEntity {
    const entity = new TareaTicketEntity(props, id);
    Object.assign(entity, { _createdAt: createdAt, _updatedAt: updatedAt });
    entity._deletedAt = deletedAt;
    return entity;
  }

  get ticketId(): string {
    return this.props.ticketId;
  }

  get descripcion(): string {
    return this.props.descripcion;
  }

  get orden(): number {
    return this.props.orden;
  }

  get tecnicoId(): string | null {
    return this.props.tecnicoId;
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

  /**
   * Marca la tarea como completada por `porId` en `ahora`. Falla si ya está completada: volver a
   * completarla pisaría el crédito de quien la completó primero.
   */
  completar(porId: string, ahora: Date): Result<void, DomainError> {
    if (this.isDeleted()) return Result.fail(new TareaEliminadaError(this.id));
    if (this.props.completada) return Result.fail(new TareaYaCompletadaError(this.id));
    this.props.completada = true;
    this.props.completadaEn = ahora;
    this.props.completadaPorId = porId;
    this.touch(ahora);
    return Result.ok(undefined);
  }

  /** Vuelve la tarea a pendiente y limpia el registro de quién y cuándo la completó. */
  descompletar(ahora: Date): Result<void, DomainError> {
    if (this.isDeleted()) return Result.fail(new TareaEliminadaError(this.id));
    if (!this.props.completada) return Result.fail(new TareaNoCompletadaError(this.id));
    this.props.completada = false;
    this.props.completadaEn = null;
    this.props.completadaPorId = null;
    this.touch(ahora);
    return Result.ok(undefined);
  }

  /**
   * Asigna el técnico, o lo quita con `null`. No toca el registro de completado: el crédito es de
   * quien completó, no del técnico asignado. La elegibilidad la valida el caso de uso.
   */
  asignarTecnico(tecnicoId: string | null, ahora: Date): Result<void, DomainError> {
    if (this.isDeleted()) return Result.fail(new TareaEliminadaError(this.id));
    this.props.tecnicoId = tecnicoId;
    this.touch(ahora);
    return Result.ok(undefined);
  }

  /** Baja lógica. Falla si la tarea ya estaba dada de baja. */
  eliminar(ahora: Date): Result<void, DomainError> {
    if (this.isDeleted()) return Result.fail(new TareaEliminadaError(this.id));
    this.softDelete(ahora);
    return Result.ok(undefined);
  }
}
