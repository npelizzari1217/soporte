import { BaseEntity } from '../../../shared/domain/base-entity';
import { Result } from '../../../shared/domain/result';
import { CompraYaDecididaError, MotivoRechazoRequeridoError } from '../errors/compras.errors';

/**
 * TicketCompraProps — shape de las propiedades del satélite de compras.
 *
 * Satélite 1:0..1 de `Ticket` (Fase 2) para tickets de tipo COMPRAS. Los
 * campos de decisión son `null` hasta que un actor con `compra:aprobar`
 * (aprobar) o `ticket:rechazar` (rechazar) toma la decisión (ADR-1).
 *
 * NORMALIZADO: guarda IDs (`aprobadoPorId` es soft ref cross-DB a
 * master.usuarios, sin FK). Sin imports de Prisma ni NestJS — dominio puro.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-C1, F3-C4, F3-C5. Ref design:
 * ADR-1. Tarea: T2.5, T2.6.
 */
export interface TicketCompraProps {
  /** UUID del ticket base (FK → tickets.id). Relación 1:0..1. */
  ticketId: string;
  /** Soft ref → master.usuarios.id. NULL hasta la decisión. */
  aprobadoPorId: string | null;
  /** Timestamp de la decisión (aprobación o rechazo). NULL hasta la decisión. */
  aprobadoEn: Date | null;
  /** Motivo del rechazo. Obligatorio cuando la decisión es rechazo. NULL en otros casos. */
  motivoRechazo: string | null;
}

/**
 * TicketCompraEntity — satélite 1:0..1 del ticket para el flujo COMPRAS
 * (ADR-1, ADR-2).
 *
 * DECISIÓN CLAVE (ADR-1): la aprobación es un gate de negocio sobre ESTE
 * satélite, NO una transición de estado del `Ticket` base — los 6 estados
 * fijos de Fase 2 (NUEVO/ASIGNADO/EN_PROCESO/RESUELTO/CERRADO/CANCELADO)
 * NO incluyen estados de aprobación. `aprobar()` NUNCA muta el ticket base
 * (eso lo verifica `AprobarCompraUseCase`, que no llama a
 * `ticket.updateEstado`). `rechazar()` sí dispara, en el USE CASE, una
 * transición del ticket base a CANCELADO (arco válido de la máquina base,
 * reutilizada sin máquina custom — ADR-2).
 *
 * "Un solo paso" = una única decisión (COLABORADOR+), sin estado
 * intermedio PENDIENTE: `aprobar()`/`rechazar()` fallan con
 * `CompraYaDecididaError` si `estaDecidida` ya es `true` (idempotencia/
 * no doble-decisión).
 *
 * Ref spec: sdd/flujos-especializados/spec F3-C1, F3-C4, F3-C5. Ref
 * design: ADR-1, ADR-2, "Firmas TS clave" (TicketCompraEntity).
 * Tarea: T2.5, T2.6.
 */
export class TicketCompraEntity extends BaseEntity<TicketCompraProps> {
  private constructor(props: TicketCompraProps, id?: string) {
    super(props, id);
  }

  /**
   * Factory method para una nueva instancia de `ticket_compra`. Los 3
   * campos de decisión se inicializan en `null` (F3-C1).
   *
   * @param props Solo `ticketId` — el resto son invariantes de creación.
   * @param id    UUID opcional. Si no se provee, se genera un UUIDv7 nuevo.
   */
  static create(props: { ticketId: string }, id?: string): TicketCompraEntity {
    return new TicketCompraEntity(
      {
        ticketId: props.ticketId,
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
    Object.assign(entity, { _createdAt: createdAt, _updatedAt: updatedAt });
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

  /** `true` si ya se tomó una decisión (aprobada o rechazada). */
  get estaDecidida(): boolean {
    return this.props.aprobadoEn !== null;
  }

  /** `true` si la decisión fue aprobar (decidida y sin motivo de rechazo). */
  get aprobada(): boolean {
    return this.estaDecidida && this.props.motivoRechazo === null;
  }

  /** `true` si la decisión fue rechazar (motivo de rechazo presente). */
  get rechazada(): boolean {
    return this.props.motivoRechazo !== null;
  }

  // ─── Comportamiento de dominio ─────────────────────────────────────────

  /**
   * Registra la aprobación de la compra (F3-C4): setea `aprobadoPorId` +
   * `aprobadoEn`. NO toca `motivoRechazo`. Falla con
   * `CompraYaDecididaError` si ya había una decisión previa (idempotencia
   * — sin doble decisión).
   *
   * `AprobarCompraUseCase` llama este método DENTRO de la misma
   * transacción que registra la operación APROBACION en el timeline — y
   * NUNCA muta el `Ticket` base (ADR-1).
   *
   * @param aprobadoPorId UUID del actor aprobador (soft ref → master.usuarios).
   * @param aprobadoEn    Timestamp de la decisión.
   */
  aprobar(aprobadoPorId: string, aprobadoEn: Date): Result<void, CompraYaDecididaError> {
    if (this.estaDecidida) {
      return Result.fail(new CompraYaDecididaError(this.id));
    }
    this.props.aprobadoPorId = aprobadoPorId;
    this.props.aprobadoEn = aprobadoEn;
    this.touch();
    return Result.ok(undefined);
  }

  /**
   * Registra el rechazo de la compra (F3-C5): setea `aprobadoPorId` +
   * `aprobadoEn` + `motivoRechazo` (requerido, no vacío tras `trim()`).
   * Falla con `CompraYaDecididaError` si ya había una decisión previa, o
   * con `MotivoRechazoRequeridoError` si `motivoRechazo` es vacío/solo
   * espacios — en ambos casos SIN mutar la entidad.
   *
   * `RechazarCompraUseCase` llama este método DENTRO de la misma
   * transacción que transiciona el `Ticket` base a CANCELADO (arco válido
   * de la máquina base, ADR-2) y registra la operación RECHAZO.
   *
   * @param aprobadoPorId UUID del actor que rechaza (soft ref → master.usuarios).
   * @param aprobadoEn    Timestamp de la decisión.
   * @param motivoRechazo Texto explicativo del rechazo (no vacío).
   */
  rechazar(
    aprobadoPorId: string,
    aprobadoEn: Date,
    motivoRechazo: string,
  ): Result<void, CompraYaDecididaError | MotivoRechazoRequeridoError> {
    if (this.estaDecidida) {
      return Result.fail(new CompraYaDecididaError(this.id));
    }
    if (!motivoRechazo || motivoRechazo.trim() === '') {
      return Result.fail(new MotivoRechazoRequeridoError());
    }
    this.props.aprobadoPorId = aprobadoPorId;
    this.props.aprobadoEn = aprobadoEn;
    this.props.motivoRechazo = motivoRechazo;
    this.touch();
    return Result.ok(undefined);
  }
}
