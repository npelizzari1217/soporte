import { BaseEntity } from '../../../shared/domain/base-entity';
import { Result } from '../../../shared/domain/result';
import { MonedaInvalidaError, MontoInvalidoError } from '../errors/compras.errors';

/** Códigos de moneda ISO 4217 aceptados (F3-C3). */
const MONEDAS_VALIDAS = new Set<string>(['ARS', 'USD', 'EUR']);

/**
 * PresupuestoProps — shape de las propiedades de un presupuesto de
 * proveedor. Sin imports de Prisma ni NestJS — dominio puro.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-C3 (Tabla presupuestos).
 * Tarea: T2.3, T2.4.
 */
export interface PresupuestoProps {
  /** UUID del ticket_compra al que pertenece (FK → ticket_compra.id). */
  ticketCompraId: string;
  /** Nombre o razón social del proveedor. Máximo 255 caracteres. */
  proveedor: string;
  /** Monto total cotizado. DEBE ser >= 0 (CHECK monto_total >= 0). */
  montoTotal: number;
  /** Código ISO 4217: ARS, USD, EUR. Default 'ARS'. */
  moneda: string;
  /** Fecha de la cotización del proveedor. */
  fechaCotizacion: Date;
  /**
   * `true` si este presupuesto fue elegido como ganador. DEFAULT `false`.
   * Solo uno puede estar `true` por `ticket_compra_id` — garantizado por
   * `SeleccionarPresupuestoUseCase` (swap atómico, ADR-7), NO por la
   * entidad ni por un constraint de DB.
   */
  seleccionado: boolean;
  /** Notas sobre la cotización (nullable). */
  observaciones: string | null;
}

/**
 * PresupuestoEntity — cotización de un proveedor para un ticket de compra
 * (F3-C3).
 *
 * Un ticket_compra puede tener múltiples presupuestos (uno por proveedor).
 * `seleccionar()`/`deseleccionar()` son mutadores puros; la invariante "un
 * solo seleccionado por ticket_compra" vive en el use case (ADR-7), no acá.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-C3. Ref design: ADR-7,
 * "Firmas TS clave" (PresupuestoEntity). Tarea: T2.3, T2.4.
 */
export class PresupuestoEntity extends BaseEntity<PresupuestoProps> {
  private constructor(props: PresupuestoProps, id?: string) {
    super(props, id);
  }

  /**
   * Factory method con validación de dominio: moneda ISO 4217 aceptada
   * (F3-C3) y `montoTotal >= 0` (CHECK de dominio y de DB).
   */
  static create(
    props: PresupuestoProps,
    id?: string,
  ): Result<PresupuestoEntity, MonedaInvalidaError | MontoInvalidoError> {
    if (!MONEDAS_VALIDAS.has(props.moneda)) {
      return Result.fail(new MonedaInvalidaError(props.moneda));
    }
    if (props.montoTotal < 0) {
      return Result.fail(new MontoInvalidoError(props.montoTotal));
    }
    return Result.ok(new PresupuestoEntity(props, id));
  }

  /**
   * Reconstitución desde persistencia (mappers de infraestructura). NO
   * re-valida moneda/monto — los datos ya fueron validados al persistir.
   */
  static reconstitute(
    props: PresupuestoProps,
    id: string,
    createdAt: Date,
    updatedAt: Date,
    deletedAt: Date | null,
  ): PresupuestoEntity {
    const entity = new PresupuestoEntity(props, id);
    Object.assign(entity, { _createdAt: createdAt, _updatedAt: updatedAt });
    entity._deletedAt = deletedAt;
    return entity;
  }

  // ─── Getters ─────────────────────────────────────────────────────────────

  get ticketCompraId(): string {
    return this.props.ticketCompraId;
  }

  get proveedor(): string {
    return this.props.proveedor;
  }

  get montoTotal(): number {
    return this.props.montoTotal;
  }

  get moneda(): string {
    return this.props.moneda;
  }

  get fechaCotizacion(): Date {
    return this.props.fechaCotizacion;
  }

  get seleccionado(): boolean {
    return this.props.seleccionado;
  }

  get observaciones(): string | null {
    return this.props.observaciones;
  }

  // ─── Comportamiento de dominio ─────────────────────────────────────────

  /**
   * Marca este presupuesto como el seleccionado (ganador). Llamado por
   * `SeleccionarPresupuestoUseCase` DESPUÉS de deseleccionar el anterior,
   * dentro de la misma transacción (swap atómico, ADR-7).
   */
  seleccionar(): void {
    this.props.seleccionado = true;
    this.touch();
  }

  /**
   * Desmarca este presupuesto como seleccionado. Llamado por
   * `SeleccionarPresupuestoUseCase` sobre el presupuesto anterior, ANTES
   * de seleccionar el nuevo.
   */
  deseleccionar(): void {
    this.props.seleccionado = false;
    this.touch();
  }
}
