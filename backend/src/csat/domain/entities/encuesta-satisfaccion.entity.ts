import { BaseEntity } from '../../../shared/domain/base-entity';
import { PuntajeCsat } from '../value-objects/puntaje-csat';

/**
 * EncuestaSatisfaccionProps — shape de las propiedades de dominio de la
 * respuesta de encuesta (TENANT, `encuestas_satisfaccion`). Sin imports de
 * Prisma ni NestJS — dominio puro. `puntaje` viaja como `number` primitivo
 * (ya validado por `PuntajeCsat` antes de construir — ver `create()`), para
 * que `reconstitute()` no dependa de re-envolver el VO al leer de DB.
 */
export interface EncuestaSatisfaccionProps {
  /** FK → tenant.tickets.id. */
  ticketId: string;
  /** Soft ref → master.encuesta_tokens.id. UNIQUE — garantía DB de una respuesta por token (ADR-C2). */
  tokenId: string;
  /** Entero 1-5, ya validado por `PuntajeCsat`. */
  puntaje: number;
  /** Comentario libre opcional. */
  comentario: string | null;
  /** Momento en que se registró la respuesta. */
  respondidaEn: Date;
}

/** Datos de entrada de `create()` — exige un `PuntajeCsat` ya validado (4.3), no un `number` crudo. */
export interface EncuestaSatisfaccionCreateProps {
  ticketId: string;
  tokenId: string;
  puntaje: PuntajeCsat;
  comentario: string | null;
  /** Defaultea a `now()` si no se provee. */
  respondidaEn?: Date;
}

/**
 * EncuestaSatisfaccionEntity — entidad de dominio de una respuesta de
 * encuesta de satisfacción. `create()` exige un `PuntajeCsat` ya validado
 * (Tarea 4.3): es estructuralmente imposible construir una instancia con un
 * puntaje fuera de rango, sin duplicar la validación de la entidad.
 *
 * Ref spec: sdd/csat/spec, Requirement "Registro de la respuesta (uso
 * único)". Tarea: 4.2.
 */
export class EncuestaSatisfaccionEntity extends BaseEntity<EncuestaSatisfaccionProps> {
  private constructor(props: EncuestaSatisfaccionProps, id?: string) {
    super(props, id);
  }

  /** Factory method para una respuesta nueva. */
  static create(props: EncuestaSatisfaccionCreateProps, id?: string): EncuestaSatisfaccionEntity {
    return new EncuestaSatisfaccionEntity(
      {
        ticketId: props.ticketId,
        tokenId: props.tokenId,
        puntaje: props.puntaje.valor,
        comentario: props.comentario,
        respondidaEn: props.respondidaEn ?? new Date(),
      },
      id,
    );
  }

  /**
   * Reconstitución desde persistencia (mappers de infraestructura). NO
   * re-valida `puntaje`: ya pasó por `PuntajeCsat` al persistirse (el CHECK
   * de DB es el backstop, no esta capa).
   */
  static reconstitute(
    props: EncuestaSatisfaccionProps,
    id: string,
    createdAt: Date,
    updatedAt: Date,
    deletedAt: Date | null,
  ): EncuestaSatisfaccionEntity {
    const entity = new EncuestaSatisfaccionEntity({ ...props }, id);
    Object.assign(entity, { _createdAt: createdAt, _updatedAt: updatedAt });
    entity._deletedAt = deletedAt;
    return entity;
  }

  // ─── Getters ─────────────────────────────────────────────────────────────

  get ticketId(): string {
    return this.props.ticketId;
  }

  get tokenId(): string {
    return this.props.tokenId;
  }

  get puntaje(): number {
    return this.props.puntaje;
  }

  get comentario(): string | null {
    return this.props.comentario;
  }

  get respondidaEn(): Date {
    return this.props.respondidaEn;
  }
}
