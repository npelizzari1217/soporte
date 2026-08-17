import { BaseEntity } from '../../../shared/domain/base-entity';
import { DomainError, Result } from '../../../shared/domain/result';
import {
  CantidadEntregadaExcedeRecibidaError,
  CantidadEntregadaRetrocedeError,
  CantidadOrdenadaExcedeSolicitadaError,
  CantidadOrdenadaRetrocedeError,
  CantidadRecibidaExcedeOrdenadaError,
  CantidadRecibidaRetrocedeError,
  FechaEtapaFuturaError,
  FechaEtapasFueraDeOrdenError,
  ItemCompraCongeladoError,
  ItemCompraNoAprobadoError,
  ItemCompraYaCerradoError,
  ItemCompraYaDecididoError,
  ItemSinFaltanteError,
  MotivoCierreFaltanteRequeridoError,
} from '../errors/compras.errors';
import { hoyArgentina, soloFecha } from '../services/fecha-argentina';
import {
  enCentesimas,
  EstadoAprobacionItem,
  itemComprado,
  itemEntregado,
  subtotalItemEnCentesimas,
} from '../services/estado-compra';

/**
 * ItemCompraEntity — completa (sdd/redisenio-modulo-compras, PR-6 + PR-7;
 * extendida por `compras-tres-etapas-y-sectores`, WU-18 + WU-19).
 *
 * PR-6 (parte 1): `create()` con validación de campos base, la decisión por
 * ítem (§4.3: `aprobar`/`rechazar`, máquina de un solo paso) y el
 * congelamiento de `cantidad`/`monto`/`moneda` una vez decidido (§4.4).
 *
 * PR-7 (parte 2, SUPERADA por WU-18): la ejecución de la compra pasó de dos
 * etapas (`registrarCompra`/`registrarEntrega`) a TRES
 * (`registrarOrden`/`registrarRecepcion`/`registrarEntrega`), encadenadas
 * `cantidadEntregada ≤ cantidadRecibida ≤ cantidadOrdenada ≤ cantidad`
 * (ADR-T1). `cantidadRecibida` es el campo que antes se llamaba
 * `cantidadComprada` (mismo campo físico, renombrado por el `RENAME COLUMN`
 * de M2) — el criterio de "comprado"/`itemComprado` no cambió, solo el
 * nombre.
 *
 * WU-19 agrega tres fechas de etapa (`fechaOrden`/`fechaRecepcion`/
 * `fechaEntrega`), nullable, prellenadas con hoy (`hoyArgentina()`) si no se
 * proveen, validadas contra: (a) no ser futuras (fecha LOCAL de Argentina,
 * `resoluciones-pre-apply` — supera a ADR-T4) y (b) mantener el orden
 * cronológico `fechaOrden ≤ fechaRecepcion ≤ fechaEntrega` entre las no
 * nulas, en CADA escritura (`editarFechaEtapa` incluido).
 *
 * Los getters `comprado`/`entregado` DELEGAN en `itemComprado`/
 * `itemEntregado` de `domain/services/estado-compra.ts` (ADR-C1: la regla
 * vive en un solo lugar, esta entidad no la re-implementa) y la aritmética
 * en centésimas (ADR-C3) para toda comparación/suma de cantidades.
 * `totalItem` (WU-20, ADR-T12) delega en `subtotalItemEnCentesimas`, la
 * MISMA fórmula que usa `CompraEntity.totalesPorMoneda`.
 *
 * Ref spec: sdd/redisenio-modulo-compras/spec §1, §4.2-§4.7, §6. Ref
 * spec-2: sdd/compras-tres-etapas-y-sectores/spec R1-R6, S42-S58. Ref
 * design: ADR-C1, ADR-C3, ADR-C6, ADR-T1, ADR-T2, ADR-T3, ADR-T4 (superado
 * en el punto de "hoyUTC" — ver `fecha-argentina.ts`), ADR-T12.
 */

/** Monedas admitidas (design, CHECK `moneda IN ('ARS','USD','EUR')`, ADR-C7). */
const MONEDAS_VALIDAS: readonly string[] = ['ARS', 'USD', 'EUR'];

/** Las tres etapas de ejecución de un ítem de compra (ADR-T1). */
export const ETAPAS_EJECUCION = ['ORDEN', 'RECEPCION', 'ENTREGA'] as const;
export type EtapaEjecucion = (typeof ETAPAS_EJECUCION)[number];

/**
 * Shape completo de las propiedades de un `ItemCompra`. Incluye los campos
 * de ejecución (`cantidadOrdenada`/`cantidadRecibida`/`cantidadEntregada`/
 * `fechaOrden`/`fechaRecepcion`/`fechaEntrega`/`cerradoConFaltante`/
 * `motivoCierreFaltante`) para que la entidad tenga forma estable desde
 * `create()` — es el único punto que los inicializa.
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
  cantidadOrdenada: number;
  cantidadRecibida: number;
  cantidadEntregada: number;
  fechaOrden: Date | null;
  fechaRecepcion: Date | null;
  fechaEntrega: Date | null;
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
   * dominio, NO un `DomainError` del catálogo — ver JSDoc de
   * `validarCamposBase`).
   *
   * Inicializa siempre `estadoAprobacion='PENDIENTE'`, `decididoPorId`/
   * `decididoEn=null`, las tres cantidades de ejecución en 0, las tres
   * fechas de etapa en `null`, `cerradoConFaltante=false`,
   * `motivoCierreFaltante=null` (spec S4).
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
      cantidadOrdenada: 0,
      cantidadRecibida: 0,
      cantidadEntregada: 0,
      fechaOrden: null,
      fechaRecepcion: null,
      fechaEntrega: null,
      cerradoConFaltante: false,
      motivoCierreFaltante: null,
    };
    return new ItemCompraEntity(fullProps, id);
  }

  /** Reconstitución desde persistencia (mappers). NO re-valida — los datos ya pasaron por `create()`/`actualizar()` al persistirse. */
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

  get cantidadOrdenada(): number {
    return this.props.cantidadOrdenada;
  }

  get cantidadRecibida(): number {
    return this.props.cantidadRecibida;
  }

  get cantidadEntregada(): number {
    return this.props.cantidadEntregada;
  }

  get fechaOrden(): Date | null {
    return this.props.fechaOrden;
  }

  get fechaRecepcion(): Date | null {
    return this.props.fechaRecepcion;
  }

  get fechaEntrega(): Date | null {
    return this.props.fechaEntrega;
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
   * `true` si `cantidadRecibida` alcanza `cantidad`, o si el ítem fue
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

  /**
   * Total de ESTE ítem (`monto × cantidad`, WU-20 R6/ADR-T12), derivado sin
   * persistirse. Usa `cantidad`/`monto` (congelados tras decisión,
   * `asegurarNoCongelado()`), NUNCA las cantidades de ejecución — es el
   * total de lo PEDIDO, no de lo ejecutado (S58: no cambia cuando cambian
   * `cantidadOrdenada`/`cantidadRecibida`/`cantidadEntregada`). Misma
   * fórmula que `CompraEntity.totalesPorMoneda` (S57: ambos derivan de
   * `subtotalItemEnCentesimas`, ÚNICA implementación).
   */
  get totalItem(): number {
    return subtotalItemEnCentesimas(this.props.monto, this.props.cantidad) / 100;
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

  // ─── Ejecución de la compra: las tres etapas (ADR-T1, WU-18/WU-19) ─────

  /**
   * Registra el acumulado TOTAL ordenado hasta el momento (primera de las
   * tres etapas). No es un delta: `cantidadOrdenada` recibe el nuevo
   * acumulado. Orden de guards, IDÉNTICO entre las tres etapas (ADR-T1):
   * 1. terminalidad (S48) 2. aprobado (S47) 3. exceso contra el techo de la
   * etapa anterior (`cantidad`, S45) 4. retroceso (S46) 5. fecha (S53-S55),
   * ANTES de mutar cualquier campo.
   */
  registrarOrden(
    cantidadOrdenada: number,
    fecha: Date = hoyArgentina(),
  ): Result<void, DomainError> {
    const guardCierre = this.asegurarNoCerrado();
    if (guardCierre.isFail()) {
      return guardCierre;
    }
    if (this.props.estadoAprobacion !== 'APROBADO') {
      return Result.fail(new ItemCompraNoAprobadoError(this.id));
    }

    const nuevaCent = enCentesimas(cantidadOrdenada);
    if (nuevaCent > enCentesimas(this.props.cantidad)) {
      return Result.fail(new CantidadOrdenadaExcedeSolicitadaError(this.id));
    }
    if (nuevaCent < enCentesimas(this.props.cantidadOrdenada)) {
      return Result.fail(new CantidadOrdenadaRetrocedeError(this.id));
    }

    const fechaValidada = this.validarFechaEtapa('ORDEN', fecha);
    if (fechaValidada.isFail()) {
      return fechaValidada;
    }

    this.props.cantidadOrdenada = cantidadOrdenada;
    this.props.fechaOrden = fecha;
    this.touch();
    return Result.ok(undefined);
  }

  /**
   * Registra el acumulado TOTAL recibido hasta el momento (segunda etapa).
   * Techo: `cantidadOrdenada` (no `cantidad` — R1: cada etapa se acota
   * contra la anterior en la cadena). Mismo orden de guards que
   * `registrarOrden`.
   */
  registrarRecepcion(
    cantidadRecibida: number,
    fecha: Date = hoyArgentina(),
  ): Result<void, DomainError> {
    const guardCierre = this.asegurarNoCerrado();
    if (guardCierre.isFail()) {
      return guardCierre;
    }
    if (this.props.estadoAprobacion !== 'APROBADO') {
      return Result.fail(new ItemCompraNoAprobadoError(this.id));
    }

    const nuevaCent = enCentesimas(cantidadRecibida);
    if (nuevaCent > enCentesimas(this.props.cantidadOrdenada)) {
      return Result.fail(new CantidadRecibidaExcedeOrdenadaError(this.id));
    }
    if (nuevaCent < enCentesimas(this.props.cantidadRecibida)) {
      return Result.fail(new CantidadRecibidaRetrocedeError(this.id));
    }

    const fechaValidada = this.validarFechaEtapa('RECEPCION', fecha);
    if (fechaValidada.isFail()) {
      return fechaValidada;
    }

    this.props.cantidadRecibida = cantidadRecibida;
    this.props.fechaRecepcion = fecha;
    this.touch();
    return Result.ok(undefined);
  }

  /**
   * Registra el acumulado TOTAL entregado hasta el momento (tercera etapa).
   * Techo: `cantidadRecibida`. **Endurecimiento real de comportamiento**
   * (S47, riesgo R-6 del design): antes de este cambio `registrarEntrega`
   * NO chequeaba `estadoAprobacion` — ahora las TRES etapas lo exigen, por
   * igual.
   */
  registrarEntrega(
    cantidadEntregada: number,
    fecha: Date = hoyArgentina(),
  ): Result<void, DomainError> {
    const guardCierre = this.asegurarNoCerrado();
    if (guardCierre.isFail()) {
      return guardCierre;
    }
    if (this.props.estadoAprobacion !== 'APROBADO') {
      return Result.fail(new ItemCompraNoAprobadoError(this.id));
    }

    const nuevaCent = enCentesimas(cantidadEntregada);
    if (nuevaCent > enCentesimas(this.props.cantidadRecibida)) {
      return Result.fail(new CantidadEntregadaExcedeRecibidaError(this.id));
    }
    if (nuevaCent < enCentesimas(this.props.cantidadEntregada)) {
      return Result.fail(new CantidadEntregadaRetrocedeError(this.id));
    }

    const fechaValidada = this.validarFechaEtapa('ENTREGA', fecha);
    if (fechaValidada.isFail()) {
      return fechaValidada;
    }

    this.props.cantidadEntregada = cantidadEntregada;
    this.props.fechaEntrega = fecha;
    this.touch();
    return Result.ok(undefined);
  }

  /**
   * Edita la fecha de una etapa YA registrada, de forma independiente de su
   * cantidad (R4/S55). Sujeta a la MISMA validación de fecha que registrar
   * la etapa (futuro + orden cronológico) — una edición retroactiva que
   * dejara el conjunto de fechas fuera de orden se rechaza COMPLETA, sin
   * persistir el valor inconsistente (S55).
   */
  editarFechaEtapa(etapa: EtapaEjecucion, fecha: Date): Result<void, DomainError> {
    const guardCierre = this.asegurarNoCerrado();
    if (guardCierre.isFail()) {
      return guardCierre;
    }

    const fechaValidada = this.validarFechaEtapa(etapa, fecha);
    if (fechaValidada.isFail()) {
      return fechaValidada;
    }

    if (etapa === 'ORDEN') {
      this.props.fechaOrden = fecha;
    } else if (etapa === 'RECEPCION') {
      this.props.fechaRecepcion = fecha;
    } else {
      this.props.fechaEntrega = fecha;
    }
    this.touch();
    return Result.ok(undefined);
  }

  /**
   * Valida la fecha de UNA etapa (R5): (a) no puede ser posterior a hoy
   * (fecha LOCAL de Argentina — `resoluciones-pre-apply` supera a ADR-T4,
   * ver `fecha-argentina.ts`), y (b) el conjunto de las tres fechas de
   * etapa, con `etapa` reemplazada por `fecha` y las otras dos tal como
   * están, debe mantener `fechaOrden ≤ fechaRecepcion ≤ fechaEntrega` entre
   * las no nulas (S54, S55). Corre ANTES de mutar cualquier campo — si
   * falla, el llamador no debe haber tocado nada todavía.
   */
  private validarFechaEtapa(etapa: EtapaEjecucion, fecha: Date): Result<void, DomainError> {
    if (soloFecha(fecha).getTime() > hoyArgentina().getTime()) {
      return Result.fail(new FechaEtapaFuturaError(this.id));
    }

    const fechaOrden = etapa === 'ORDEN' ? fecha : this.props.fechaOrden;
    const fechaRecepcion = etapa === 'RECEPCION' ? fecha : this.props.fechaRecepcion;
    const fechaEntrega = etapa === 'ENTREGA' ? fecha : this.props.fechaEntrega;

    const pares: Array<[Date | null, Date | null]> = [
      [fechaOrden, fechaRecepcion],
      [fechaRecepcion, fechaEntrega],
      [fechaOrden, fechaEntrega],
    ];
    for (const [anterior, posterior] of pares) {
      if (anterior && posterior && soloFecha(anterior).getTime() > soloFecha(posterior).getTime()) {
        return Result.fail(new FechaEtapasFueraDeOrdenError(this.id));
      }
    }

    return Result.ok(undefined);
  }

  /**
   * Cierra el ítem con faltante (§4.7, req 9): registra que no se va a
   * completar la cantidad pedida y por qué. TERMINAL (S25, spec §6
   * invariante 3) — a partir de acá `asegurarNoCerrado()` bloquea cualquier
   * `registrarOrden`/`registrarRecepcion`/`registrarEntrega`/
   * `cerrarConFaltante` posterior sobre este ítem.
   *
   * S22 (la cláusula OR): NO fuerza `cantidadRecibida`/`cantidadEntregada`
   * a la cantidad pedida — deja el faltante real registrado y son los
   * getters `comprado`/`entregado` (vía `itemComprado`/`itemEntregado`)
   * los que pasan a `true` por el flag `cerradoConFaltante`, no por haber
   * alcanzado la cantidad.
   *
   * Orden de guards: terminalidad primero (S25), después
   * `estadoAprobacion === 'APROBADO'`, después motivo requerido (S24) y
   * faltante real sobre `cantidadRecibida` (S23/R3 — mismo campo, renombrado).
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
    if (enCentesimas(this.props.cantidadRecibida) >= enCentesimas(this.props.cantidad)) {
      return Result.fail(new ItemSinFaltanteError(this.id));
    }

    this.props.cerradoConFaltante = true;
    this.props.motivoCierreFaltante = motivo;
    this.touch();
    return Result.ok(undefined);
  }

  /**
   * Guard de terminalidad (S25, S48, spec §6 invariante 3) CENTRALIZADO: el
   * único lugar que decide si el ítem admite nuevas etapas/cierres.
   * `cerradoConFaltante` es un estado sin retorno.
   */
  private asegurarNoCerrado(): Result<void, DomainError> {
    if (this.props.cerradoConFaltante) {
      return Result.fail(new ItemCompraYaCerradoError(this.id));
    }
    return Result.ok(undefined);
  }
}
