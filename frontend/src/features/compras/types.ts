/**
 * Tipos del dominio Compras — espejo de los DTOs reales del backend
 * (`backend/src/compras/interface/dtos/compras.dto.ts`).
 *
 * `numero`/`solicitanteId`/`cicloId` NUNCA viajan en el body de un comando
 * (invariante del backend, ver JSDoc de `CrearCompraHttpDto` en
 * `compras.dto.ts`): `numero` lo genera `NumeradorCompra` dentro de la
 * transacción, `solicitanteId` es siempre `JWT.sub`, `cicloId` lo resuelve
 * `ResolverCicloActivoParaCreacion`. Ninguno de los tres aparece en los DTOs
 * de comando de este archivo — no lo agregues sin volver a leer el backend.
 *
 * Prohibido `any` (regla base). Estos tipos son la única fuente de verdad de
 * forma en el front — los hooks (`features/compras/hooks`) los usan como
 * genérico de `apiFetch<T>()`.
 */

/** Estado de aprobación de un ítem — máquina de un paso, sin retorno (espejo de `EstadoAprobacionItem`). */
export type EstadoAprobacionItem = "PENDIENTE" | "APROBADO" | "RECHAZADO";

/** Estado derivado de la cabecera de una compra (espejo de `EstadoCompra`, tabla de verdad T1-T5 + Regla 0). */
export type EstadoCompra =
  | "PENDIENTE"
  | "APROBADO"
  | "APROBADO_PARCIALMENTE"
  | "RECHAZADO"
  | "CANCELADO";

/** Set CERRADO de monedas admitidas (ADR-C7, `CHECK moneda IN (...)`), espejo de `MONEDAS_ADMITIDAS` del backend. */
export type Moneda = "ARS" | "USD" | "EUR";

/**
 * Catálogo CERRADO de tipos de operación de bitácora (espejo de
 * `TipoOperacionCompra`). WU-26 (`compras-tres-etapas-y-sectores`
 * ADR-T11): `COMPRA_REGISTRADA` es LEGACY (solo aparece en filas
 * históricas); `ORDEN_REGISTRADA`/`RECEPCION_REGISTRADA` son los tipos
 * vigentes de las dos primeras etapas.
 */
export type TipoOperacionCompra =
  | "CREACION"
  | "COMPRA_EDITADA"
  | "ITEM_AGREGADO"
  | "ITEM_EDITADO"
  | "ITEM_ELIMINADO"
  | "ITEM_APROBADO"
  | "ITEM_RECHAZADO"
  | "ORDEN_REGISTRADA"
  | "RECEPCION_REGISTRADA"
  | "ENTREGA_REGISTRADA"
  | "ITEM_CERRADO_CON_FALTANTE"
  | "CANCELACION"
  | "COMPRA_REGISTRADA";

/** Las tres etapas de ejecución de un ítem (espejo de `EtapaEjecucion`, ADR-T1). */
export type EtapaEjecucion = "ORDEN" | "RECEPCION" | "ENTREGA";

/**
 * Espejo de `ItemCompraResponseDto`. Sólo aparece en el detalle
 * (`CompraDetalle.items`) — el listado NUNCA lo incluye (S33).
 *
 * WU-26 (`compras-tres-etapas-y-sectores`): `cantidadComprada` se partió en
 * `cantidadOrdenada`/`cantidadRecibida` (la etapa nueva de ORDEN se
 * intercala antes de lo que antes era "comprada"); se agregan las tres
 * fechas de etapa y `totalItem` (derivado, R6).
 */
export interface ItemCompra {
  id: string;
  compraId: string;
  descripcion: string;
  cantidad: number;
  proveedor: string;
  monto: number;
  moneda: string;
  fechaCotizacion: string;
  observaciones: string | null;
  estadoAprobacion: EstadoAprobacionItem;
  /** ADR-C6: nombres neutros — también se escriben en el RECHAZO. */
  decididoPorId: string | null;
  decididoEn: string | null;
  cantidadOrdenada: number;
  cantidadRecibida: number;
  cantidadEntregada: number;
  fechaOrden: string | null;
  fechaRecepcion: string | null;
  fechaEntrega: string | null;
  /** Total de este ítem (`monto × cantidad`) — derivado, no persistido (R6). */
  totalItem: number;
  cerradoConFaltante: boolean;
  motivoCierreFaltante: string | null;
  comprado: boolean;
  entregado: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Espejo de `CompraListItemResponseDto` — fila de `GET /compras` (S33):
 * SOLO derivados de cabecera, **NUNCA `items`**.
 */
export interface CompraListItem {
  id: string;
  numero: string;
  fechaSolicitud: string;
  motivo: string;
  estado: EstadoCompra;
  comprado: boolean;
  cerrado: boolean;
  totalesPorMoneda: Record<string, number>;
}

/**
 * Espejo de `ListarComprasResponseDto` — envoltorio con metadata de
 * paginación. `total` es el universo filtrado completo, no el tamaño de la
 * página.
 */
export interface ListarComprasResponse {
  items: CompraListItem[];
  total: number;
  pagina: number;
  porPagina: number;
}

/** Espejo de `CompraDetalleResponseDto` — detalle CON ítems (a diferencia del listado, S33). */
export interface CompraDetalle {
  id: string;
  numero: string;
  fechaSolicitud: string;
  motivo: string;
  descripcion: string | null;
  solicitanteId: string;
  cicloId: string;
  /** Sector de destino de la cabecera (R11). `null` si no se asignó. */
  sectorId: string | null;
  estado: EstadoCompra;
  comprado: boolean;
  cerrado: boolean;
  totalesPorMoneda: Record<string, number>;
  canceladaEn: string | null;
  canceladoPorId: string | null;
  motivoCancelacion: string | null;
  items: ItemCompra[];
  createdAt: string;
  updatedAt: string;
}

/** Espejo de `OperacionCompraResponseDto` — entrada de la bitácora (`GET /compras/:id/operaciones`). */
export interface OperacionCompra {
  id: string;
  compraId: string;
  itemCompraId: string | null;
  tipo: TipoOperacionCompra;
  usuarioId: string;
  detalle: string;
  datos: Record<string, unknown> | null;
  createdAt: string;
}

// ─── Payloads de comando (espejo de los *HttpDto de entrada) ──────────────

/**
 * Body de `POST /compras` (`CrearCompraHttpDto`). `numero`/`solicitanteId`/
 * `cicloId` los resuelve el servidor — nunca van acá.
 */
export interface CrearCompraDto {
  motivo: string;
  descripcion?: string | null;
  fechaSolicitud: string;
  /** Sector de destino (R11) — opcional, sin backfill (S66). */
  sectorId?: string;
}

/**
 * Body de `PATCH /compras/:id` (`EditarCompraHttpDto`) — edición de la
 * CABECERA. PATCH semántico: campo ausente no se toca, `null` limpia
 * `descripcion`/`sectorId`.
 *
 * `numero`/`solicitanteId`/`cicloId` NO están acá, igual que en
 * `CrearCompraDto` — con un agravante: en el alta los resuelve el servidor,
 * pero en la edición ya están escritos, así que mandarlos permitiría
 * reescribir la identidad de una compra existente.
 */
export interface EditarCompraDto {
  motivo?: string;
  descripcion?: string | null;
  fechaSolicitud?: string;
  sectorId?: string | null;
}

/** Body de `POST /compras/:id/items` (`AgregarItemCompraHttpDto`). */
export interface AgregarItemCompraDto {
  descripcion: string;
  cantidad: number;
  proveedor: string;
  monto: number;
  moneda: string;
  fechaCotizacion: string;
  observaciones?: string | null;
}

/**
 * Body de `PATCH /compras/:id/items/:itemId` (`EditarItemCompraHttpDto`) —
 * PATCH semántico, `undefined` no toca el campo.
 */
export interface EditarItemCompraDto {
  descripcion?: string;
  cantidad?: number;
  proveedor?: string;
  monto?: number;
  moneda?: string;
  fechaCotizacion?: string;
  observaciones?: string | null;
}

/**
 * Body de registrar orden (`RegistrarOrdenDeItemHttpDto`, WU-26) —
 * `cantidadOrdenada` es ACUMULADO, no delta. `fecha` opcional: sin ella, el
 * backend prellena con hoy (Argentina).
 */
export interface RegistrarOrdenDeItemDto {
  cantidadOrdenada: number;
  fecha?: string;
}

/**
 * Body de registrar recepción (`RegistrarRecepcionDeItemHttpDto`, WU-26) —
 * reemplaza a `RegistrarCompraDeItemDto`. `cantidadRecibida` ACUMULADO.
 */
export interface RegistrarRecepcionDeItemDto {
  cantidadRecibida: number;
  fecha?: string;
}

/** Body de registrar avance de entrega (`RegistrarEntregaDeItemHttpDto`) — `cantidadEntregada` es ACUMULADO, no delta. */
export interface RegistrarEntregaDeItemDto {
  cantidadEntregada: number;
  fecha?: string;
}

/** Body de `PATCH .../fecha-etapa` (`EditarFechaEtapaHttpDto`, WU-26 R4/S55). */
export interface EditarFechaEtapaDto {
  etapa: EtapaEjecucion;
  fecha: string;
}

/** Body de `POST .../cerrar-con-faltante` (`CerrarItemConFaltanteHttpDto`). */
export interface CerrarItemConFaltanteDto {
  motivo: string;
}

/** Body de `POST /compras/:id/cancelar` (`CancelarCompraHttpDto`). */
export interface CancelarCompraDto {
  motivo: string;
}

/**
 * Grupo de estado por el que filtra el listado (`FiltroGrupoEstadoCompra` del
 * backend). Son los MISMOS tres conjuntos —mutuamente excluyentes y
 * exhaustivos— por los que el servidor ordena la página, más `TODAS` para no
 * filtrar. Unión literal a propósito: un `string` dejaría pasar valores que el
 * backend rechaza.
 */
export type FiltroEstadoCompra = "ACTIVAS" | "COMPLETADAS" | "CANCELADAS" | "TODAS";

/**
 * Query params de `GET /compras` (`ListarComprasQueryDto`). WU-30 agrega los
 * 5 filtros de negocio (R7/R11) a la paginación existente; WU-25 reemplaza el
 * booleano `soloEnCurso` (`@deprecated` en el backend) por `estado`.
 */
export interface ComprasFiltros {
  pagina?: number;
  porPagina?: number;
  cicloId?: string;
  estado?: FiltroEstadoCompra;
  sectorId?: string;
  fechaDesde?: string;
  fechaHasta?: string;
}
