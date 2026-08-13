import { BaseEntity } from '../../../shared/domain/base-entity';
import { DomainError, Result } from '../../../shared/domain/result';
import { ItemCompraCongeladoError, ItemCompraYaDecididoError } from '../errors/compras.errors';
import { EstadoAprobacionItem } from '../services/estado-compra';

/**
 * ItemCompraEntity — parte 1 de 2 (sdd/redisenio-modulo-compras, PR-6).
 *
 * Cubre: `create()` con validación de campos base, la decisión por ítem
 * (§4.3: `aprobar`/`rechazar`, máquina de un solo paso) y el congelamiento
 * de `cantidad`/`monto`/`moneda` una vez decidido (§4.4).
 *
 * FUERA DE ALCANCE de este archivo en PR-6 (se agrega en PR-7, "parte 2 de
 * 2"): `registrarCompra`/`registrarEntrega`/`cerrarConFaltante`, la
 * aritmética en centésimas (ADR-C3) y los getters `comprado`/`entregado`
 * consumidos por `derivarEstadoCompra` (PR-4). `cantidadComprada`,
 * `cantidadEntregada`, `cerradoConFaltante` y `motivoCierreFaltante` ya
 * viven en `ItemCompraProps` (greenfield, evita romper el shape en PR-7) y
 * se inicializan en sus valores por defecto desde `create()`, pero esta
 * parte no expone mutadores para ellos.
 *
 * Ref spec: sdd/redisenio-modulo-compras/spec §1 (modelo), §4.2-§4.4, §6.
 * Ref design: ADR-C3, ADR-C6 (rename `decididoPorId`/`decididoEn`).
 * Tarea: PR-6.
 */

/** Monedas admitidas (design, CHECK `moneda IN ('ARS','USD','EUR')`, ADR-C7). */
const MONEDAS_VALIDAS: readonly string[] = ['ARS', 'USD', 'EUR'];

/**
 * Shape completo de las propiedades de un `ItemCompra`. Incluye los campos
 * de PR-7 (`cantidadComprada`/`cantidadEntregada`/`cerradoConFaltante`/
 * `motivoCierreFaltante`) para que la entidad tenga forma estable desde
 * PR-6 — `create()` es el único punto que los inicializa en esta parte.
 */
export interface ItemCompraProps {
  readonly compraId: string;
  descripcion: string;
  cantidad: number;
  proveedor: string;
  monto: number;
  moneda: string;
  fechaCotizacion: Date;
  observaciones: string | null;
  estadoAprobacion: EstadoAprobacionItem;
  decididoPorId: string | null;
  decididoEn: Date | null;
  cantidadComprada: number;
  cantidadEntregada: number;
  cerradoConFaltante: boolean;
  motivoCierreFaltante: string | null;
}

/** Datos de entrada de `create()` — los campos derivados/por-defecto NO se aceptan (spec S4: "nace PENDIENTE con cantidades en 0"). */
export interface ItemCompraCreateProps {
  compraId: string;
  descripcion: string;
  cantidad: number;
  proveedor: string;
  monto: number;
  moneda: string;
  fechaCotizacion: Date;
  observaciones: string | null;
}

/** Campos editables por `actualizar()`. `cantidad`/`monto`/`moneda` están sujetos al congelamiento (§4.4); el resto (S14) no. */
export interface ItemCompraActualizarProps {
  descripcion?: string;
  cantidad?: number;
  proveedor?: string;
  monto?: number;
  moneda?: string;
  fechaCotizacion?: Date;
  observaciones?: string | null;
}

export class ItemCompraEntity extends BaseEntity<ItemCompraProps> {
  private constructor(props: ItemCompraProps, id?: string) {
    super(props, id);
  }

  /**
   * Factory de un ítem nuevo. Valida los campos base (precondición del
   * dominio, NO un `DomainError` del catálogo: no existe ninguno de los 19
   * errores de `compras.errors.ts` para esto — la spec/design no reservó
   * uno y este PR no puede crear errores nuevos. Se modela como `throw`
   * plano, siguiendo la distinción documentada en `result.ts`: `Result`
   * modela fallos ESPERADOS del dominio (S10, S13); un valor primitivo
   * inválido llegando acá es una violación de precondición del caller
   * (equivalente a un bug si el DTO/`class-validator` de la capa HTTP hizo
   * su trabajo), no un camino de negocio a manejar aguas arriba.
   *
   * Inicializa siempre `estadoAprobacion='PENDIENTE'`, `decididoPorId`/
   * `decididoEn=null`, `cantidadComprada`/`cantidadEntregada=0`,
   * `cerradoConFaltante=false`, `motivoCierreFaltante=null` (spec S4).
   */
  static create(props: ItemCompraCreateProps, id?: string): ItemCompraEntity {
    ItemCompraEntity.validarCamposBase(
      props.cantidad,
      props.monto,
      props.moneda,
      props.fechaCotizacion,
    );

    const fullProps: ItemCompraProps = {
      ...props,
      estadoAprobacion: 'PENDIENTE',
      decididoPorId: null,
      decididoEn: null,
      cantidadComprada: 0,
      cantidadEntregada: 0,
      cerradoConFaltante: false,
      motivoCierreFaltante: null,
    };
    return new ItemCompraEntity(fullProps, id);
  }

  /** Reconstitución desde persistencia (mappers, PR-10). NO re-valida — los datos ya pasaron por `create()`/`actualizar()` al persistirse. */
  static reconstitute(
    props: ItemCompraProps,
    id: string,
    createdAt: Date,
    updatedAt: Date,
    deletedAt: Date | null,
  ): ItemCompraEntity {
    const entity = new ItemCompraEntity({ ...props }, id);
    Object.assign(entity, { _createdAt: createdAt, _updatedAt: updatedAt });
    entity._deletedAt = deletedAt;
    return entity;
  }

  /**
   * Precondición de dominio compartida por `create()` y `actualizar()`:
   * `cantidad > 0`, `monto >= 0`, `moneda` en el catálogo admitido,
   * `fechaCotizacion` una `Date` válida. Espejo de los CHECKs de DB
   * (ADR-C7) — la autoridad es el dominio, el CHECK es backstop.
   */
  private static validarCamposBase(
    cantidad: number,
    monto: number,
    moneda: string,
    fechaCotizacion: Date,
  ): void {
    if (!(cantidad > 0)) {
      throw new Error(`ItemCompraEntity: cantidad debe ser mayor a 0 (recibido: ${cantidad}).`);
    }
    if (!(monto >= 0)) {
      throw new Error(`ItemCompraEntity: monto no puede ser negativo (recibido: ${monto}).`);
    }
    if (!MONEDAS_VALIDAS.includes(moneda)) {
      throw new Error(
        `ItemCompraEntity: moneda "${moneda}" no es válida. Admitidas: ${MONEDAS_VALIDAS.join(', ')}.`,
      );
    }
    if (!(fechaCotizacion instanceof Date) || Number.isNaN(fechaCotizacion.getTime())) {
      throw new Error('ItemCompraEntity: fechaCotizacion inválida.');
    }
  }

  // ─── Getters ─────────────────────────────────────────────────────────────

  get compraId(): string {
    return this.props.compraId;
  }

  get descripcion(): string {
    return this.props.descripcion;
  }

  get cantidad(): number {
    return this.props.cantidad;
  }

  get proveedor(): string {
    return this.props.proveedor;
  }

  get monto(): number {
    return this.props.monto;
  }

  get moneda(): string {
    return this.props.moneda;
  }

  get fechaCotizacion(): Date {
    return this.props.fechaCotizacion;
  }

  get observaciones(): string | null {
    return this.props.observaciones;
  }

  get estadoAprobacion(): EstadoAprobacionItem {
    return this.props.estadoAprobacion;
  }

  get decididoPorId(): string | null {
    return this.props.decididoPorId;
  }

  get decididoEn(): Date | null {
    return this.props.decididoEn;
  }

  get cantidadComprada(): number {
    return this.props.cantidadComprada;
  }

  get cantidadEntregada(): number {
    return this.props.cantidadEntregada;
  }

  get cerradoConFaltante(): boolean {
    return this.props.cerradoConFaltante;
  }

  get motivoCierreFaltante(): string | null {
    return this.props.motivoCierreFaltante;
  }

  /**
   * `true` si el ítem ya fue decidido — APROBADO **o** RECHAZADO (ADR-C3).
   * Es el predicado único que gatea tanto el congelamiento (§4.4) como la
   * re-decisión (S10): ambos casos, no solo la aprobación, deben tratarse
   * como "ya no admite cambios de decisión/cantidades".
   */
  get decidido(): boolean {
    return this.props.estadoAprobacion !== 'PENDIENTE';
  }

  // ─── Comportamiento de dominio ─────────────────────────────────────────

  /**
   * Aprueba el ítem (S8). Falla con `ItemCompraYaDecididoError` si ya fue
   * decidido (S10) — ver `decidir()` para la garantía de no-mutación.
   */
  aprobar(decididoPorId: string, decididoEn: Date = new Date()): Result<void, DomainError> {
    return this.decidir('APROBADO', decididoPorId, decididoEn);
  }

  /**
   * Rechaza el ítem (S9). Falla con `ItemCompraYaDecididoError` si ya fue
   * decidido (S10) — ver `decidir()` para la garantía de no-mutación.
   */
  rechazar(decididoPorId: string, decididoEn: Date = new Date()): Result<void, DomainError> {
    return this.decidir('RECHAZADO', decididoPorId, decididoEn);
  }

  /**
   * Núcleo compartido de `aprobar()`/`rechazar()` — la máquina de un solo
   * paso (spec §6 invariante 2). El guard de "ya decidido" es el PRIMER
   * paso, ANTES de tocar cualquier campo: si falla, `estadoAprobacion`,
   * `decididoPorId` y `decididoEn` quedan bit a bit iguales a como estaban
   * (S10 exige assertear el estado POSTERIOR a la llamada fallida, no solo
   * el `Result`).
   */
  private decidir(
    estado: Extract<EstadoAprobacionItem, 'APROBADO' | 'RECHAZADO'>,
    decididoPorId: string,
    decididoEn: Date,
  ): Result<void, DomainError> {
    if (this.decidido) {
      return Result.fail(new ItemCompraYaDecididoError(this.id));
    }
    this.props.estadoAprobacion = estado;
    this.props.decididoPorId = decididoPorId;
    this.props.decididoEn = decididoEn;
    this.touch();
    return Result.ok(undefined);
  }

  /**
   * Edita los campos de solicitud del ítem (§4.2/§4.4).
   *
   * Congelamiento (S13): si `datos` toca `cantidad`/`monto`/`moneda` Y el
   * ítem ya está `decidido` (APROBADO **o** RECHAZADO), falla con
   * `ItemCompraCongeladoError` SIN mutar ningún campo — el guard corre
   * antes de cualquier asignación, centralizado en `asegurarNoCongelado()`
   * (un único lugar, no repetido por setter).
   *
   * Campos libres (S14): `descripcion`/`proveedor`/`fechaCotizacion`/
   * `observaciones` siguen editables aunque el ítem esté decidido — no
   * pasan por el guard de congelamiento.
   *
   * Validación (§1): si se provee un nuevo valor de `cantidad`/`monto`/
   * `moneda`/`fechaCotizacion`, se valida el conjunto resultante ANTES de
   * mutar (misma regla que `create()`, mismo criterio de `throw` — ver
   * `validarCamposBase()`).
   *
   * PATCH semántico: `undefined` no toca el campo; `observaciones: null`
   * lo limpia explícitamente (mismo criterio que `ComponenteEquipoEntity.actualizar`).
   */
  actualizar(datos: ItemCompraActualizarProps): Result<void, DomainError> {
    const tocaCamposCongelados =
      datos.cantidad !== undefined || datos.monto !== undefined || datos.moneda !== undefined;

    if (tocaCamposCongelados) {
      const guard = this.asegurarNoCongelado();
      if (guard.isFail()) {
        return guard;
      }
    }

    const tocaCamposValidables = tocaCamposCongelados || datos.fechaCotizacion !== undefined;
    if (tocaCamposValidables) {
      ItemCompraEntity.validarCamposBase(
        datos.cantidad ?? this.props.cantidad,
        datos.monto ?? this.props.monto,
        datos.moneda ?? this.props.moneda,
        datos.fechaCotizacion ?? this.props.fechaCotizacion,
      );
    }

    if (datos.descripcion !== undefined) {
      this.props.descripcion = datos.descripcion;
    }
    if (datos.cantidad !== undefined) {
      this.props.cantidad = datos.cantidad;
    }
    if (datos.proveedor !== undefined) {
      this.props.proveedor = datos.proveedor;
    }
    if (datos.monto !== undefined) {
      this.props.monto = datos.monto;
    }
    if (datos.moneda !== undefined) {
      this.props.moneda = datos.moneda;
    }
    if (datos.fechaCotizacion !== undefined) {
      this.props.fechaCotizacion = datos.fechaCotizacion;
    }
    if (datos.observaciones !== undefined) {
      this.props.observaciones = datos.observaciones;
    }

    this.touch();
    return Result.ok(undefined);
  }

  /**
   * Guard de congelamiento (§4.4, S13) CENTRALIZADO — el único lugar que
   * decide si `cantidad`/`monto`/`moneda` admiten edición. `decidido`
   * cubre APROBADO **y** RECHAZADO (el caso que se olvida con más
   * frecuencia): ambos estados congelan estos tres campos por igual.
   */
  private asegurarNoCongelado(): Result<void, DomainError> {
    if (this.decidido) {
      return Result.fail(new ItemCompraCongeladoError(this.id));
    }
    return Result.ok(undefined);
  }
}
