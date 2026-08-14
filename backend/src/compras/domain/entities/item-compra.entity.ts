import { BaseEntity } from '../../../shared/domain/base-entity';
import { DomainError, Result } from '../../../shared/domain/result';
import {
  CantidadCompradaExcedeSolicitadaError,
  CantidadCompradaRetrocedeError,
  CantidadEntregadaExcedeCompradaError,
  CantidadEntregadaRetrocedeError,
  ItemCompraCongeladoError,
  ItemCompraNoAprobadoError,
  ItemCompraYaCerradoError,
  ItemCompraYaDecididoError,
  ItemSinFaltanteError,
  MotivoCierreFaltanteRequeridoError,
} from '../errors/compras.errors';
import {
  enCentesimas,
  EstadoAprobacionItem,
  itemComprado,
  itemEntregado,
} from '../services/estado-compra';

/**
 * ItemCompraEntity — completa (sdd/redisenio-modulo-compras, PR-6 + PR-7).
 *
 * PR-6 (parte 1): `create()` con validación de campos base, la decisión por
 * ítem (§4.3: `aprobar`/`rechazar`, máquina de un solo paso) y el
 * congelamiento de `cantidad`/`monto`/`moneda` una vez decidido (§4.4).
 *
 * PR-7 (parte 2): ejecución de la compra —
 * `registrarCompra`/`registrarEntrega`/`cerrarConFaltante` (§4.5-§4.7), los
 * getters `comprado`/`entregado` que DELEGAN en `itemComprado`/
 * `itemEntregado` de `domain/services/estado-compra.ts` (ADR-C1: la regla
 * vive en un solo lugar, esta entidad no la re-implementa) y la aritmética
 * en centésimas (ADR-C3) para toda comparación/suma de cantidades.
 *
 * Ref spec: sdd/redisenio-modulo-compras/spec §1 (modelo), §4.2-§4.7, §6.
 * Ref design: ADR-C1, ADR-C3, ADR-C6 (rename `decididoPorId`/`decididoEn`).
 * Tareas: PR-6, PR-7.
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

  /**
   * `true` si `cantidadComprada` alcanza `cantidad`, o si el ítem fue
   * cerrado con faltante (S22, cláusula OR). DELEGA en `itemComprado` de
   * `domain/services/estado-compra.ts` (ADR-C1) — la entidad NO
   * re-implementa la regla ni la aritmética en centésimas.
   */
  get comprado(): boolean {
    return itemComprado(this.props);
  }

  /**
   * `true` si `cantidadEntregada` alcanza `cantidad`, o si el ítem fue
   * cerrado con faltante (S22, cláusula OR). DELEGA en `itemEntregado` de
   * `domain/services/estado-compra.ts` (ADR-C1) — misma razón que `comprado`.
   */
  get entregado(): boolean {
    return itemEntregado(this.props);
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

  // ─── Ejecución de la compra (§4.5-§4.7, PR-7) ──────────────────────────

  /**
   * Registra la cantidad TOTAL comprada hasta el momento (§4.5). No es un
   * delta: `cantidadComprada` recibe el nuevo acumulado y el guard exige
   * que sea `>=` al valor ya registrado (spec §7.3: nunca retrocede) y
   * `<=` la cantidad solicitada. Comparaciones en centésimas (ADR-C3, ver
   * `enCentesimas`) — un error de carga queda registrado hasta que exista
   * un caso de uso de corrección explícito (hoy fuera de alcance).
   *
   * Orden de guards: terminalidad (S25) primero — un ítem cerrado con
   * faltante no admite NINGUNA compra posterior, sin importar el valor —
   * después "no aprobado" (S16), después exceso (S17) y retroceso (S18).
   */
  registrarCompra(cantidadComprada: number): Result<void, DomainError> {
    const guardCierre = this.asegurarNoCerrado();
    if (guardCierre.isFail()) {
      return guardCierre;
    }
    if (this.props.estadoAprobacion !== 'APROBADO') {
      return Result.fail(new ItemCompraNoAprobadoError(this.id));
    }

    const nuevaCent = enCentesimas(cantidadComprada);
    if (nuevaCent > enCentesimas(this.props.cantidad)) {
      return Result.fail(new CantidadCompradaExcedeSolicitadaError(this.id));
    }
    if (nuevaCent < enCentesimas(this.props.cantidadComprada)) {
      return Result.fail(new CantidadCompradaRetrocedeError(this.id));
    }

    this.props.cantidadComprada = cantidadComprada;
    this.touch();
    return Result.ok(undefined);
  }

  /**
   * Registra la cantidad TOTAL entregada hasta el momento (§4.6). Mismo
   * criterio de acumulado (no delta) y de nunca-retroceso que
   * `registrarCompra`, pero acotado contra `cantidadComprada` en vez de
   * `cantidad` (no se puede entregar más de lo que se compró).
   * Comparaciones en centésimas (ADR-C3).
   */
  registrarEntrega(cantidadEntregada: number): Result<void, DomainError> {
    const guardCierre = this.asegurarNoCerrado();
    if (guardCierre.isFail()) {
      return guardCierre;
    }

    const nuevaCent = enCentesimas(cantidadEntregada);
    if (nuevaCent > enCentesimas(this.props.cantidadComprada)) {
      return Result.fail(new CantidadEntregadaExcedeCompradaError(this.id));
    }
    if (nuevaCent < enCentesimas(this.props.cantidadEntregada)) {
      return Result.fail(new CantidadEntregadaRetrocedeError(this.id));
    }

    this.props.cantidadEntregada = cantidadEntregada;
    this.touch();
    return Result.ok(undefined);
  }

  /**
   * Cierra el ítem con faltante (§4.7, req 9): registra que no se va a
   * completar la cantidad pedida y por qué. TERMINAL (S25, spec §6
   * invariante 3) — a partir de acá `asegurarNoCerrado()` bloquea cualquier
   * `registrarCompra`/`registrarEntrega`/`cerrarConFaltante` posterior
   * sobre este ítem.
   *
   * S22 (la cláusula OR): NO fuerza `cantidadComprada`/`cantidadEntregada`
   * a la cantidad pedida — deja el faltante real registrado y son los
   * getters `comprado`/`entregado` (vía `itemComprado`/`itemEntregado`)
   * los que pasan a `true` por el flag `cerradoConFaltante`, no por haber
   * alcanzado la cantidad.
   *
   * Orden de guards (actualizado, verify-report C1): terminalidad primero
   * (S25 — cerrar dos veces también debe dar `ItemCompraYaCerradoError`, no
   * un error distinto), después `estadoAprobacion === 'APROBADO'` (sin
   * spec propio: es el espejo en dominio del CHECK de DB
   * `items_compra_faltante_solo_aprobado_check`, ADR-C7 — la autoridad es
   * el dominio, el CHECK es backstop, y antes de este fix el dominio era
   * MÁS PERMISIVO que su propio backstop). Va SEGUNDO, no tercero ni
   * cuarto, siguiendo el mismo precedente que `registrarCompra()` (línea
   * arriba en esta clase): un ítem no aprobado es un estado que invalida la
   * operación completa, así que se descarta ANTES de evaluar el contenido
   * del pedido (motivo, S24) o sus cantidades (faltante real, S23) — no
   * tiene sentido validar el "cómo" de un cierre que ni siquiera puede
   * ocurrir por el "quién". Por último motivo requerido (S24) y faltante
   * real (S23): sin faltante real no hay nada que cerrar.
   */
  cerrarConFaltante(motivo: string): Result<void, DomainError> {
    const guardCierre = this.asegurarNoCerrado();
    if (guardCierre.isFail()) {
      return guardCierre;
    }
    if (this.props.estadoAprobacion !== 'APROBADO') {
      return Result.fail(new ItemCompraNoAprobadoError(this.id));
    }
    if (!motivo || motivo.trim().length === 0) {
      return Result.fail(new MotivoCierreFaltanteRequeridoError(this.id));
    }
    if (enCentesimas(this.props.cantidadComprada) >= enCentesimas(this.props.cantidad)) {
      return Result.fail(new ItemSinFaltanteError(this.id));
    }

    this.props.cerradoConFaltante = true;
    this.props.motivoCierreFaltante = motivo;
    this.touch();
    return Result.ok(undefined);
  }

  /**
   * Guard de terminalidad (S25, spec §6 invariante 3) CENTRALIZADO: el
   * único lugar que decide si el ítem admite compras/entregas/cierres
   * nuevos. `cerradoConFaltante` es un estado sin retorno.
   */
  private asegurarNoCerrado(): Result<void, DomainError> {
    if (this.props.cerradoConFaltante) {
      return Result.fail(new ItemCompraYaCerradoError(this.id));
    }
    return Result.ok(undefined);
  }
}
