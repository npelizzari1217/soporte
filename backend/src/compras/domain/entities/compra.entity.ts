import { BaseEntity } from '../../../shared/domain/base-entity';
import { DomainError, Result } from '../../../shared/domain/result';
import {
  CompraCanceladaError,
  ItemCompraAprobadoNoEliminableError,
  ItemCompraNoEncontradoError,
} from '../errors/compras.errors';
import { derivarEstadoCompra, EstadoCompra } from '../services/estado-compra';
import {
  ItemCompraActualizarProps,
  ItemCompraCreateProps,
  ItemCompraEntity,
} from './item-compra.entity';

/**
 * CompraEntity — raíz del agregado `Compra` (sdd/redisenio-modulo-compras, PR-8 parte 1/2).
 *
 * `ItemCompra` vive DENTRO del agregado (ADR-C2: puerto único, divergencia
 * declarada vs `equipos`) — esta raíz mantiene su colección de ítems como
 * campo PRIVADO (`_items`); el único camino para mutarla es a través de los
 * métodos de esta clase (`agregarItem`/`editarItem`/`eliminarItem`), nunca
 * empujando directamente al array devuelto por el getter `items`.
 *
 * `estado`/`comprado`/`cerrado` son getters que DELEGAN en
 * `derivarEstadoCompra` (`domain/services/estado-compra.ts`, ADR-C1) — esta
 * entidad NO re-implementa la tabla de verdad. La entidad EXIGE tener sus
 * ítems cargados (`create()` arranca en `[]`, `reconstitute()` los recibe
 * como parámetro obligatorio): no existe un camino de hidratación parcial
 * donde el getter pueda mentir por datos incompletos.
 *
 * ALCANCE de esta parte (PR-8, §4.1 + §4.2): `create()` con validación de
 * campos base, el ABM de ítems (`agregarItem`/`editarItem`/`eliminarItem`,
 * S4-S7) y los getters derivados. `cancelar()` y `totalesPorMoneda` quedan
 * DEFERIDOS a PR-9 (parte 2/2) — no se tocan acá.
 *
 * Ref spec: sdd/redisenio-modulo-compras/spec §1, §2, §4.1, §4.2, §6.
 * Ref design: ADR-C1, ADR-C2.
 * Tarea: PR-8.
 */

/** Shape completo de las propiedades persistidas de una `Compra` (spec §1). */
export interface CompraProps {
  readonly numero: string;
  fechaSolicitud: Date;
  motivo: string;
  descripcion: string | null;
  readonly solicitanteId: string;
  readonly cicloId: string;
  canceladaEn: Date | null;
  canceladoPorId: string | null;
  motivoCancelacion: string | null;
}

/** Datos de entrada de `create()` — los campos de cancelación NO se aceptan: una compra siempre nace sin cancelar. */
export interface CompraCreateProps {
  numero: string;
  fechaSolicitud: Date;
  motivo: string;
  descripcion: string | null;
  solicitanteId: string;
  cicloId: string;
}

/** Datos de entrada de `agregarItem()` — igual a `ItemCompraCreateProps` sin `compraId` (lo resuelve la raíz con su propio `id`). */
export type CompraAgregarItemProps = Omit<ItemCompraCreateProps, 'compraId'>;

export class CompraEntity extends BaseEntity<CompraProps> {
  /**
   * Colección de ítems del agregado — PRIVADA (ADR-C2). El getter `items`
   * expone una copia de solo lectura; los soft-deleted quedan incluidos ahí
   * (los mappers de PR-10 necesitan persistir su `deletedAt`), pero la
   * derivación de estado los excluye vía `itemsActivos()` (spec §2: "n =
   * ítems no eliminados").
   */
  private readonly _items: ItemCompraEntity[];

  private constructor(props: CompraProps, items: ItemCompraEntity[], id?: string) {
    super(props, id);
    this._items = items;
  }

  /**
   * Factory de una compra nueva (§4.1, S1). Nace SIEMPRE sin cancelar y sin
   * ítems (`n=0` -> `PENDIENTE` por T1, spec §2). Valida los campos base —
   * mismo criterio que `ItemCompraEntity.create()`: precondición del
   * dominio modelada con `throw` (no hay un `DomainError` del catálogo de
   * 19 reservado para esto, y este PR no crea errores nuevos).
   */
  static create(props: CompraCreateProps, id?: string): CompraEntity {
    CompraEntity.validarCamposBase(
      props.numero,
      props.motivo,
      props.fechaSolicitud,
      props.solicitanteId,
      props.cicloId,
    );

    const fullProps: CompraProps = {
      ...props,
      canceladaEn: null,
      canceladoPorId: null,
      motivoCancelacion: null,
    };
    return new CompraEntity(fullProps, [], id);
  }

  /**
   * Reconstitución desde persistencia (mappers, PR-10). `items` es
   * OBLIGATORIO — no existe una sobrecarga que lo omita: la exigencia de
   * "ítems siempre cargados" está modelada en la firma, no asumida por
   * convención. NO re-valida — los datos ya pasaron por `create()`/ABM al
   * persistirse.
   */
  static reconstitute(
    props: CompraProps,
    items: ItemCompraEntity[],
    id: string,
    createdAt: Date,
    updatedAt: Date,
    deletedAt: Date | null,
  ): CompraEntity {
    const entity = new CompraEntity({ ...props }, [...items], id);
    Object.assign(entity, { _createdAt: createdAt, _updatedAt: updatedAt });
    entity._deletedAt = deletedAt;
    return entity;
  }

  /**
   * Precondición de dominio de `create()`: `numero`/`motivo`/`solicitanteId`/
   * `cicloId` no vacíos, `fechaSolicitud` una `Date` válida. `descripcion` es
   * nullable, sin validación de contenido.
   */
  private static validarCamposBase(
    numero: string,
    motivo: string,
    fechaSolicitud: Date,
    solicitanteId: string,
    cicloId: string,
  ): void {
    if (!numero || numero.trim().length === 0) {
      throw new Error('CompraEntity: numero es obligatorio.');
    }
    if (!motivo || motivo.trim().length === 0) {
      throw new Error('CompraEntity: motivo es obligatorio.');
    }
    if (!(fechaSolicitud instanceof Date) || Number.isNaN(fechaSolicitud.getTime())) {
      throw new Error('CompraEntity: fechaSolicitud inválida.');
    }
    if (!solicitanteId || solicitanteId.trim().length === 0) {
      throw new Error('CompraEntity: solicitanteId es obligatorio.');
    }
    if (!cicloId || cicloId.trim().length === 0) {
      throw new Error('CompraEntity: cicloId es obligatorio.');
    }
  }

  // ─── Getters ─────────────────────────────────────────────────────────────

  get numero(): string {
    return this.props.numero;
  }

  get fechaSolicitud(): Date {
    return this.props.fechaSolicitud;
  }

  get motivo(): string {
    return this.props.motivo;
  }

  get descripcion(): string | null {
    return this.props.descripcion;
  }

  get solicitanteId(): string {
    return this.props.solicitanteId;
  }

  get cicloId(): string {
    return this.props.cicloId;
  }

  get canceladaEn(): Date | null {
    return this.props.canceladaEn;
  }

  get canceladoPorId(): string | null {
    return this.props.canceladoPorId;
  }

  get motivoCancelacion(): string | null {
    return this.props.motivoCancelacion;
  }

  /** Copia de solo lectura de los ítems del agregado — INCLUYE soft-deleted (PR-10 los necesita para persistir `deletedAt`). Mutar esta colección desde afuera no tiene efecto: `_items` es privado. */
  get items(): readonly ItemCompraEntity[] {
    return [...this._items];
  }

  /**
   * `estado` DELEGA en `derivarEstadoCompra` (ADR-C1) — no hay una segunda
   * implementación de la tabla de verdad acá. Ver `derivarEstado()`.
   */
  get estado(): EstadoCompra {
    return this.derivarEstado().estado;
  }

  /** `comprado` DELEGA en `derivarEstadoCompra` (ADR-C1) — misma razón que `estado`. */
  get comprado(): boolean {
    return this.derivarEstado().comprado;
  }

  /** `cerrado` DELEGA en `derivarEstadoCompra` (ADR-C1) — misma razón que `estado`. */
  get cerrado(): boolean {
    return this.derivarEstado().cerrado;
  }

  /**
   * Arma la entrada ESTRUCTURAL (`CompraParaDerivacion`) que espera
   * `derivarEstadoCompra` y la invoca. Único punto del archivo que construye
   * esa vista — `itemsActivos()` filtra los soft-deleted (spec §2: "n =
   * ítems no eliminados") ANTES de pasarlos a la función pura.
   */
  private derivarEstado(): ReturnType<typeof derivarEstadoCompra> {
    return derivarEstadoCompra({
      cancelada: this.props.canceladaEn !== null,
      items: this.itemsActivos().map((item) => ({
        estadoAprobacion: item.estadoAprobacion,
        comprado: item.comprado,
        entregado: item.entregado,
      })),
    });
  }

  /** Ítems no soft-deleted del agregado — la vista que cuenta para la tabla de verdad (spec §2). */
  private itemsActivos(): ItemCompraEntity[] {
    return this._items.filter((item) => !item.isDeleted());
  }

  /** Busca un ítem activo (no soft-deleted) por id dentro del agregado. */
  private buscarItemActivo(itemId: string): ItemCompraEntity | undefined {
    return this.itemsActivos().find((item) => item.id === itemId);
  }

  // ─── ABM de ítems (§4.2, PR-8) ──────────────────────────────────────────

  /**
   * Agrega un ítem nuevo al agregado (S4). El ítem nace `PENDIENTE` con
   * cantidades en 0 (`ItemCompraEntity.create()`), así que si la cabecera
   * estaba `APROBADO`/`APROBADO_PARCIALMENTE`/`RECHAZADO` **vuelve a
   * `PENDIENTE`** por T2 — consecuencia intencional de que `estado` sea
   * 100% derivado (spec §4.2): no hace falta lógica extra acá, el getter
   * `estado` recalcula solo al incluir el ítem nuevo en `itemsActivos()`.
   *
   * S5: falla con `CompraCanceladaError` si la compra está cancelada, ANTES
   * de crear el ítem.
   */
  agregarItem(datos: CompraAgregarItemProps): Result<void, DomainError> {
    const guardCancelada = this.asegurarNoCancelada();
    if (guardCancelada.isFail()) {
      return guardCancelada;
    }

    const item = ItemCompraEntity.create({ ...datos, compraId: this.id });
    this._items.push(item);
    this.touch();
    return Result.ok(undefined);
  }

  /**
   * Edita un ítem existente del agregado (§4.2/§4.4) — delega la mutación
   * en `ItemCompraEntity.actualizar()` (congelamiento S13, campos libres
   * S14 ya resueltos ahí; esta raíz no repite esa lógica).
   *
   * Falla con `CompraCanceladaError` si la compra está cancelada, o con
   * `ItemCompraNoEncontradoError` si `itemId` no corresponde a un ítem
   * activo del agregado.
   */
  editarItem(itemId: string, datos: ItemCompraActualizarProps): Result<void, DomainError> {
    const guardCancelada = this.asegurarNoCancelada();
    if (guardCancelada.isFail()) {
      return guardCancelada;
    }

    const item = this.buscarItemActivo(itemId);
    if (!item) {
      return Result.fail(new ItemCompraNoEncontradoError(itemId));
    }

    const result = item.actualizar(datos);
    if (result.isOk()) {
      this.touch();
    }
    return result;
  }

  /**
   * Elimina (soft-delete) un ítem del agregado (§4.2). S6: PENDIENTE o
   * RECHAZADO se pueden eliminar. S7: APROBADO está PROHIBIDO -> falla con
   * `ItemCompraAprobadoNoEliminableError`, sin tocar el ítem.
   *
   * Falla con `CompraCanceladaError` si la compra está cancelada, o con
   * `ItemCompraNoEncontradoError` si `itemId` no corresponde a un ítem
   * activo del agregado.
   */
  eliminarItem(itemId: string): Result<void, DomainError> {
    const guardCancelada = this.asegurarNoCancelada();
    if (guardCancelada.isFail()) {
      return guardCancelada;
    }

    const item = this.buscarItemActivo(itemId);
    if (!item) {
      return Result.fail(new ItemCompraNoEncontradoError(itemId));
    }
    if (item.estadoAprobacion === 'APROBADO') {
      return Result.fail(new ItemCompraAprobadoNoEliminableError(itemId));
    }

    item.softDelete();
    this.touch();
    return Result.ok(undefined);
  }

  /**
   * Guard de cancelación (S5, Regla 0) CENTRALIZADO — el único lugar que
   * decide si el ABM de ítems admite mutaciones. Compartido por
   * `agregarItem`/`editarItem`/`eliminarItem`.
   */
  private asegurarNoCancelada(): Result<void, DomainError> {
    if (this.props.canceladaEn !== null) {
      return Result.fail(new CompraCanceladaError(this.id));
    }
    return Result.ok(undefined);
  }
}
