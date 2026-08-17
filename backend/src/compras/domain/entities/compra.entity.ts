import { BaseEntity } from '../../../shared/domain/base-entity';
import { DomainError, Result } from '../../../shared/domain/result';
import {
  CompraCanceladaError,
  CompraConComprasRegistradasError,
  CompraYaCanceladaError,
  CompraYaCerradaError,
  ItemCompraAprobadoNoEliminableError,
  ItemCompraNoEncontradoError,
} from '../errors/compras.errors';
import { derivarEstadoCompra, enCentesimas, EstadoCompra } from '../services/estado-compra';
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
 * ALCANCE PR-8 (§4.1 + §4.2): `create()` con validación de campos base, el
 * ABM de ítems (`agregarItem`/`editarItem`/`eliminarItem`, S4-S7) y los
 * getters derivados.
 *
 * ALCANCE PR-9, parte 2/2 (§4.8 + §7 punto 1): `cancelar()` (S27-S31) y el
 * getter `totalesPorMoneda` (suma TODOS los ítems activos, sin filtrar por
 * `estadoAprobacion` — decisión confirmada del usuario, no un supuesto).
 *
 * Ref spec: sdd/redisenio-modulo-compras/spec §1, §2, §4.1, §4.2, §4.8, §6, §7.1.
 * Ref design: ADR-C1, ADR-C2, ADR-C3.
 * Tareas: PR-8, PR-9.
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
  /**
   * Sector de destino (WU-09, sdd/compras-tres-etapas-y-sectores/spec R11).
   * Nullable, sin backfill (S67) — uno por compra, en cabecera. Opcional en
   * el tipo (no requerido en el objeto) para no forzar a los ~17 call-sites
   * existentes de `reconstitute()` a declararlo explícitamente; el getter
   * normaliza `undefined` a `null`.
   */
  sectorId?: string | null;
}

/** Datos de entrada de `create()` — los campos de cancelación NO se aceptan: una compra siempre nace sin cancelar. */
export interface CompraCreateProps {
  numero: string;
  fechaSolicitud: Date;
  motivo: string;
  descripcion: string | null;
  solicitanteId: string;
  cicloId: string;
  /** Opcional (WU-09, R11) — compra nueva puede o no llevar sector (S66). */
  sectorId?: string | null;
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
      sectorId: props.sectorId ?? null,
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

  /** Sector de destino de la cabecera (WU-09, R11). `null` si no se asignó (S66/S67). */
  get sectorId(): string | null {
    return this.props.sectorId ?? null;
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

  // ─── Cancelación (§4.8, PR-9 parte 2/2) ────────────────────────────────

  /**
   * Cancela la compra (§4.8, S27-S31). El efecto es puramente estructural:
   * setea `canceladaEn`/`canceladoPorId`/`motivoCancelacion`, y a partir de
   * ahí `derivarEstadoCompra` (ADR-C1) aplica la Regla 0 sola — este método
   * NO repite la tabla de verdad ni fuerza `estado='CANCELADO'` a mano.
   *
   * Orden de guards (cada uno corta antes de mutar nada):
   * 1. `motivoCancelacion` no vacío — precondición de dominio modelada con
   *    `throw`, mismo criterio que `validarCamposBase`/`ItemCompraEntity`:
   *    NINGUNO de los 19 errores del catálogo (`compras.errors.ts`) está
   *    reservado para "cancelar sin motivo" — §4.8 y §5 no listan ese
   *    escenario como error de negocio. Es una violación de contrato del
   *    caller (equivalente a un bug si el DTO/`class-validator` de la capa
   *    HTTP hizo su trabajo), no un camino a modelar con `Result`. Este PR
   *    NO crea errores nuevos.
   * 2. S30 ya cancelada -> `CompraYaCanceladaError` (idempotencia: no
   *    sobrescribe los datos de la primera cancelación).
   * 3. S28 ya cerrada -> `CompraYaCerradaError` (todos los ítems aprobados
   *    ya fueron entregados o cerrados con faltante: la ejecución de la
   *    compra ya terminó, cancelar no tiene sentido de negocio).
   * 4. S29 — guarda EXISTENCIAL "¿algún ítem activo tiene
   *    `cantidadComprada > 0`?" -> `CompraConComprasRegistradasError`: el
   *    camino correcto para esa situación es cerrar ese ítem con faltante,
   *    no cancelar la compra entera. Sobre `itemsActivos()` VACÍO (`n=0`,
   *    S31) esta guarda NO se dispara: `[].some(...)` es `false`, y esa
   *    `false` es la respuesta CORRECTA, no un caso límite a parchear.
   *    **Asimetría deliberada respecto de §3**: acá el cuantificador es
   *    EXISTENCIAL y la vacuidad `false` es la lectura correcta del spec;
   *    en `derivarEstadoCompra` el cuantificador es UNIVERSAL sobre el
   *    subconjunto aprobado y ahí la vacuidad se fuerza a `false` por
   *    decisión explícita del usuario (spec §3). Son dos reglas distintas
   *    sobre dos formas distintas de cuantificar — no se unifican.
   */
  cancelar(
    canceladoPorId: string,
    motivoCancelacion: string,
    canceladaEn: Date = new Date(),
  ): Result<void, DomainError> {
    if (!motivoCancelacion || motivoCancelacion.trim().length === 0) {
      throw new Error('CompraEntity.cancelar: motivoCancelacion es obligatorio.');
    }
    if (this.props.canceladaEn !== null) {
      return Result.fail(new CompraYaCanceladaError(this.id));
    }
    if (this.cerrado) {
      return Result.fail(new CompraYaCerradaError(this.id));
    }
    const algunItemConCompraRegistrada = this.itemsActivos().some(
      (item) => item.cantidadComprada > 0,
    );
    if (algunItemConCompraRegistrada) {
      return Result.fail(new CompraConComprasRegistradasError(this.id));
    }

    this.props.canceladaEn = canceladaEn;
    this.props.canceladoPorId = canceladoPorId;
    this.props.motivoCancelacion = motivoCancelacion;
    this.touch();
    return Result.ok(undefined);
  }

  // ─── Totales (§7 punto 1, PR-9 parte 2/2) ──────────────────────────────

  /**
   * Suma `monto × cantidad` de TODOS los ítems ACTIVOS (no eliminados) de
   * la compra, agrupada por `moneda` — spec §7 punto 1, **decisión
   * CONFIRMADA por el usuario, no un supuesto**: NO filtra por
   * `estadoAprobacion` (incluye PENDIENTE y RECHAZADO). Representa cuánto
   * se está PIDIENDO en total, el número que se mira para decidir si
   * aprobar — no cuánto se aprobó ni cuánto se ejecutó.
   *
   * Aritmética en centésimas ENTERAS de punta a punta (ADR-C3,
   * `enCentesimas`): `monto` y `cantidad` tienen precisión `Decimal(x,2)`,
   * así que `enCentesimas(monto) * enCentesimas(cantidad)` es SIEMPRE una
   * multiplicación de dos enteros (exacta en float64 para montos/cantidades
   * de magnitud razonable) — dividir ese producto por 100 y redondear da el
   * subtotal del ítem en centésimas de moneda SIN pasar por una
   * multiplicación de decimales en float. Los subtotales se ACUMULAN como
   * enteros (suma de enteros, exacta) y recién al final cada acumulado se
   * divide por 100 para volver a unidades normales. Sumar directamente en
   * float (`monto * cantidad` repetido por ítem) es exactamente el caso que
   * rompe: `0.1 + 0.1 + 0.1 === 0.30000000000000004 !== 0.3` en IEEE-754
   * (verificado empíricamente, ver `compra.entity.spec.ts`).
   */
  get totalesPorMoneda(): Record<string, number> {
    const totalesCentPorMoneda = new Map<string, number>();

    for (const item of this.itemsActivos()) {
      const subtotalCent = Math.round(
        (enCentesimas(item.monto) * enCentesimas(item.cantidad)) / 100,
      );
      const acumuladoCent = totalesCentPorMoneda.get(item.moneda) ?? 0;
      totalesCentPorMoneda.set(item.moneda, acumuladoCent + subtotalCent);
    }

    const totales: Record<string, number> = {};
    for (const [moneda, cent] of totalesCentPorMoneda) {
      totales[moneda] = cent / 100;
    }
    return totales;
  }
}
