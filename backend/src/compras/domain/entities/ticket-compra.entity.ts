import { BaseEntity } from '../../../shared/domain/base-entity';

/**
 * TicketCompraProps — shape de las propiedades del satélite de compras.
 *
 * Entidad 1:1 con Ticket para tickets de tipo COMPRAS.
 * Los campos de aprobación son null inicialmente; se setean al aprobar/rechazar.
 *
 * NORMALIZADO: guarda IDs (aprobadoPorId es soft ref cross-DB a master.usuarios).
 * Sin imports de Prisma ni NestJS — dominio puro.
 *
 * Ref spec: [SPEC:compras/Tabla ticket_compra]
 * Tarea: 4.A.2
 */
export interface TicketCompraProps {
  /** UUID del ticket base (FK → tickets.id). Relación 1:1. */
  ticketId: string;
  /**
   * Soft ref → master.usuarios.id. NULL hasta que se tome la decisión de aprobación.
   * Se setea al aprobar o rechazar la compra.
   */
  aprobadoPorId: string | null;
  /** Timestamp de la decisión de aprobación o rechazo. NULL hasta la decisión. */
  aprobadoEn: Date | null;
  /** Motivo del rechazo. Obligatorio cuando la decisión es RECHAZADO. NULL en otros casos. */
  motivoRechazo: string | null;
}

/**
 * TicketCompraEntity — satélite 1:1 del ticket para el flujo COMPRAS.
 *
 * Agrega el ciclo de aprobación al ticket base. Los campos de aprobación
 * comienzan como null y se completan cuando un usuario con permiso
 * `compra:aprobar` toma la decisión.
 *
 * Reglas de dominio:
 * - Al crear: todos los campos de aprobación son null.
 * - aprobar(): setea aprobadoPorId + aprobadoEn. motivoRechazo permanece null.
 * - rechazar(): setea aprobadoPorId + aprobadoEn + motivoRechazo (requerido).
 *
 * Ref spec: [SPEC:compras/Tabla ticket_compra, Ciclo de aprobación]
 * Tarea: 4.A.2
 */
export class TicketCompraEntity extends BaseEntity<TicketCompraProps> {
  /**
   * Factory method para una nueva instancia de ticket_compra.
   * Todos los campos de aprobación se inicializan en null.
   *
   * @param ticketId UUID del ticket base al que pertenece.
   * @param id       UUID opcional. Si no se provee, se genera un UUIDv7 nuevo.
   */
  static create(ticketId: string, id?: string): TicketCompraEntity {
    return new TicketCompraEntity(
      {
        ticketId,
        aprobadoPorId: null,
        aprobadoEn: null,
        motivoRechazo: null,
      },
      id,
    );
  }

  /**
   * Reconstitución desde persistencia (mappers de infraestructura).
   */
  static reconstitute(
    props: TicketCompraProps,
    id: string,
    createdAt: Date,
    updatedAt: Date,
    deletedAt: Date | null,
  ): TicketCompraEntity {
    const entity = new TicketCompraEntity(props, id);
    (entity as any)._createdAt = createdAt;
    (entity as any)._updatedAt = updatedAt;
    entity._deletedAt = deletedAt;
    return entity;
  }

  // ─── Getters ─────────────────────────────────────────────────────────────

  get ticketId(): string {
    return this.props.ticketId;
  }

  get aprobadoPorId(): string | null {
    return this.props.aprobadoPorId;
  }

  get aprobadoEn(): Date | null {
    return this.props.aprobadoEn;
  }

  get motivoRechazo(): string | null {
    return this.props.motivoRechazo;
  }

  // ─── Comportamiento de dominio ─────────────────────────────────────────

  /**
   * Registra la aprobación de la compra.
   * Setea aprobadoPorId y aprobadoEn. No toca motivoRechazo.
   *
   * El caso de uso AprobarCompraUseCase llama este método dentro de la
   * misma transacción que transiciona el ticket a APROBADO.
   *
   * @param aprobadoPorId UUID del usuario aprobador (soft ref → master.usuarios).
   * @param aprobadoEn    Timestamp de la decisión.
   */
  aprobar(aprobadoPorId: string, aprobadoEn: Date): void {
    this.props.aprobadoPorId = aprobadoPorId;
    this.props.aprobadoEn = aprobadoEn;
  }

  /**
   * Registra el rechazo de la compra.
   * Setea aprobadoPorId, aprobadoEn y motivoRechazo (requerido en RECHAZADO).
   *
   * El caso de uso RechazarCompraUseCase llama este método dentro de la
   * misma transacción que transiciona el ticket a RECHAZADO y luego a CERRADO.
   *
   * @param aprobadoPorId UUID del usuario que rechaza (soft ref → master.usuarios).
   * @param aprobadoEn    Timestamp de la decisión.
   * @param motivoRechazo Texto explicativo del rechazo (no puede ser vacío).
   */
  rechazar(aprobadoPorId: string, aprobadoEn: Date, motivoRechazo: string): void {
    this.props.aprobadoPorId = aprobadoPorId;
    this.props.aprobadoEn = aprobadoEn;
    this.props.motivoRechazo = motivoRechazo;
  }
}
