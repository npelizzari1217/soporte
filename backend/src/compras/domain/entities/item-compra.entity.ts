import { BaseEntity } from '../../../shared/domain/base-entity';
import { Result } from '../../../shared/domain/result';
import { CantidadInvalidaError } from '../errors/compras.errors';

/**
 * ItemCompraProps — shape de las propiedades de un ítem de compra.
 *
 * Sin imports de Prisma ni NestJS — dominio puro.
 *
 * Ref spec: [SPEC:compras/Tabla items_compra]
 * Tarea: 4.A.2
 */
export interface ItemCompraProps {
  /** UUID del ticket_compra al que pertenece (FK → ticket_compra.id). */
  ticketCompraId: string;
  /** Descripción de lo que se desea comprar. Máximo 255 caracteres. */
  descripcion: string;
  /**
   * Cantidad requerida. DEBE ser mayor a 0.
   * Ref spec: CHECK (cantidad > 0) en la tabla.
   */
  cantidad: number;
  /** Unidad de medida (nullable). Ej: "unidad", "kg", "litro". */
  unidad: string | null;
  /** Precio de referencia por unidad (estimado, no cotizado — nullable). */
  precioUnitarioRef: number | null;
  /** Detalle adicional del ítem (nullable). */
  observaciones: string | null;
}

/**
 * ItemCompraEntity — ítem individual de una compra.
 *
 * Un ticket de compra puede tener uno o más ítems. La validación de `cantidad > 0`
 * es un invariante de la entidad, verificado en el factory method `create()`.
 *
 * Ref spec: [SPEC:compras/Tabla items_compra, Gestión de ítems]
 * Tarea: 4.A.2
 */
export class ItemCompraEntity extends BaseEntity<ItemCompraProps> {
  private constructor(props: ItemCompraProps, id?: string) {
    super(props, id);
  }

  /**
   * Factory method con validación de dominio.
   * Verifica que `cantidad > 0` antes de crear el ítem.
   *
   * @returns Result.ok(ItemCompraEntity) si la cantidad es válida.
   * @returns Result.fail(CantidadInvalidaError) si cantidad <= 0.
   */
  static create(
    props: ItemCompraProps,
    id?: string,
  ): Result<ItemCompraEntity, CantidadInvalidaError> {
    if (props.cantidad <= 0) {
      return Result.fail(new CantidadInvalidaError(props.cantidad));
    }
    return Result.ok(new ItemCompraEntity(props, id));
  }

  /**
   * Reconstitución desde persistencia (mappers de infraestructura).
   * No valida cantidad — los datos ya fueron validados al persistir.
   */
  static reconstitute(
    props: ItemCompraProps,
    id: string,
    createdAt: Date,
    updatedAt: Date,
    deletedAt: Date | null,
  ): ItemCompraEntity {
    const entity = new ItemCompraEntity(props, id);
    (entity as any)._createdAt = createdAt;
    (entity as any)._updatedAt = updatedAt;
    entity._deletedAt = deletedAt;
    return entity;
  }

  // ─── Getters ─────────────────────────────────────────────────────────────

  get ticketCompraId(): string {
    return this.props.ticketCompraId;
  }

  get descripcion(): string {
    return this.props.descripcion;
  }

  get cantidad(): number {
    return this.props.cantidad;
  }

  get unidad(): string | null {
    return this.props.unidad;
  }

  get precioUnitarioRef(): number | null {
    return this.props.precioUnitarioRef;
  }

  get observaciones(): string | null {
    return this.props.observaciones;
  }
}
