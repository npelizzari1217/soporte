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

/** Catálogo CERRADO de tipos de operación de bitácora (espejo de `TipoOperacionCompra`). */
export type TipoOperacionCompra =
  | "CREACION"
  | "ITEM_AGREGADO"
  | "ITEM_EDITADO"
  | "ITEM_ELIMINADO"
  | "ITEM_APROBADO"
  | "ITEM_RECHAZADO"
  | "COMPRA_REGISTRADA"
  | "ENTREGA_REGISTRADA"
  | "ITEM_CERRADO_CON_FALTANTE"
  | "CANCELACION";

/**
 * Espejo de `ItemCompraResponseDto`. Sólo aparece en el detalle
 * (`CompraDetalle.items`) — el listado NUNCA lo incluye (S33).
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
  cantidadComprada: number;
  cantidadEntregada: number;
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

/** Body de registrar avance de compra (`RegistrarCompraDeItemHttpDto`) — `cantidadComprada` es ACUMULADO, no delta. */
export interface RegistrarCompraDeItemDto {
  cantidadComprada: number;
}

/** Body de registrar avance de entrega (`RegistrarEntregaDeItemHttpDto`) — `cantidadEntregada` es ACUMULADO, no delta. */
export interface RegistrarEntregaDeItemDto {
  cantidadEntregada: number;
}

/** Body de `POST .../cerrar-con-faltante` (`CerrarItemConFaltanteHttpDto`). */
export interface CerrarItemConFaltanteDto {
  motivo: string;
}

/** Body de `POST /compras/:id/cancelar` (`CancelarCompraHttpDto`). */
export interface CancelarCompraDto {
  motivo: string;
}

/** Query params de `GET /compras` (`ListarComprasQueryDto`) — sólo paginación. */
export interface ComprasFiltros {
  pagina?: number;
  porPagina?: number;
}
