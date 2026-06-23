import { BaseEntity } from '../../../shared/domain/base-entity';
import { Result } from '../../../shared/domain/result';
import { MonedaInvalidaError } from '../errors/compras.errors';

/**
 * Códigos de moneda ISO 4217 aceptados.
 * Ref spec: [SPEC:compras/Tabla presupuestos — moneda ISO 4217: ARS, USD, EUR]
 */
const MONEDAS_VALIDAS = new Set<string>(['ARS', 'USD', 'EUR']);

/**
 * PresupuestoProps — shape de las propiedades de un presupuesto de proveedor.
 *
 * Sin imports de Prisma ni NestJS — dominio puro.
 *
 * Ref spec: [SPEC:compras/Tabla presupuestos]
 * Tarea: 4.A.2
 */
export interface PresupuestoProps {
  /** UUID del ticket_compra al que pertenece (FK → ticket_compra.id). */
  ticketCompraId: string;
  /** Nombre o razón social del proveedor. Máximo 255 caracteres. */
  proveedor: string;
  /** Monto total cotizado. Debe ser >= 0. */
  montoTotal: number;
  /**
   * Código ISO 4217 de la moneda cotizada.
   * Valores aceptados: ARS, USD, EUR. Default: 'ARS'.
   * Ref spec: CHECK implícito via validación de dominio.
   */
  moneda: string;
  /** Fecha de la cotización del proveedor. */
  fechaCotizacion: Date;
  /**
   * TRUE si este presupuesto fue elegido como ganador.
   * DEFAULT false. Solo uno puede estar seleccionado por ticket_compra
   * (garantizado en SeleccionarPresupuestoUseCase con transacción).
   */
  seleccionado: boolean;
  /** Notas sobre la cotización (nullable). */
  observaciones: string | null;
}

/**
 * PresupuestoEntity — cotización de un proveedor para un ticket de compra.
 *
 * Un ticket de compra puede tener múltiples presupuestos (uno por proveedor).
 * Solo uno puede estar marcado como `seleccionado = true` a la vez; la
 * invariante es aplicada por `SeleccionarPresupuestoUseCase` con un swap
 * atómico (set anterior FALSE, set nuevo TRUE en la misma transacción).
 *
 * Ref spec: [SPEC:compras/Tabla presupuestos, Selección única de presupuesto]
 * Tarea: 4.A.2
 */
export class PresupuestoEntity extends BaseEntity<PresupuestoProps> {
  private constructor(props: PresupuestoProps, id?: string) {
    super(props, id);
  }

  /**
   * Factory method con validación de dominio.
   * Verifica que la moneda sea un código ISO 4217 aceptado (ARS, USD, EUR).
   *
   * @returns Result.ok(PresupuestoEntity) si la moneda es válida.
   * @returns Result.fail(MonedaInvalidaError) si la moneda no es aceptada.
   */
  static create(
    props: PresupuestoProps,
    id?: string,
  ): Result<PresupuestoEntity, MonedaInvalidaError> {
    if (!MONEDAS_VALIDAS.has(props.moneda)) {
      return Result.fail(new MonedaInvalidaError(props.moneda));
    }
    return Result.ok(new PresupuestoEntity(props, id));
  }

  /**
   * Reconstitución desde persistencia (mappers de infraestructura).
   * No valida moneda — los datos ya fueron validados al persistir.
   */
  static reconstitute(
    props: PresupuestoProps,
    id: string,
    createdAt: Date,
    updatedAt: Date,
    deletedAt: Date | null,
  ): PresupuestoEntity {
    const entity = new PresupuestoEntity(props, id);
    (entity as any)._createdAt = createdAt;
    (entity as any)._updatedAt = updatedAt;
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
   * Marca este presupuesto como el seleccionado (ganador).
   *
   * En producción, este método se llama dentro de `SeleccionarPresupuestoUseCase`
   * que primero deselecciona el presupuesto anterior en la misma transacción.
   */
  seleccionar(): void {
    this.props.seleccionado = true;
  }

  /**
   * Desmarca este presupuesto como seleccionado.
   * Llamado por `SeleccionarPresupuestoUseCase` antes de seleccionar el nuevo.
   */
  deseleccionar(): void {
    this.props.seleccionado = false;
  }
}
