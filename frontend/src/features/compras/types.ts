/**
 * Tipos del dominio Compras — espejo de los DTOs reales del backend
 * (`backend/src/compras/interface/dtos/compras.dto.ts`).
 *
 * `GET /compras/:id` (`:id` = id del `Ticket` BASE) cierra el gap G7
 * (sdd/beta-frontend/backend-gaps item 1): devuelve el detalle con
 * `items`/`presupuestos` EMBEBIDOS. `CompraDetailView` consume ese GET como
 * fuente inicial real; las secciones (`CompraItemsSection`/
 * `CompraPresupuestosSection`) siguen reflejando altas/bajas optimistamente
 * vía el cache local `["compra-items"|"compra-presupuestos", compraId]`
 * (sembrado con los datos reales del GET, ya no arranca vacío).
 */

/** Shape unificado de un ticket de compra (`TicketCompraConTicketResponseDto`). `id` = id del satélite `ticket_compra`. */
export interface TicketCompra {
  id: string;
  ticketId: string;
  numero: string;
  titulo: string;
  estadoId: string;
  aprobadoPorId: string | null;
  aprobadoEn: string | null;
  motivoRechazo: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ItemCompra {
  id: string;
  ticketCompraId: string;
  descripcion: string;
  cantidad: number;
  unidad: string | null;
  precioUnitarioRef: number | null;
  observaciones: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Presupuesto {
  id: string;
  ticketCompraId: string;
  proveedor: string;
  montoTotal: number;
  moneda: string;
  fechaCotizacion: string;
  seleccionado: boolean;
  observaciones: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CrearTicketCompraDto {
  titulo: string;
  descripcion?: string | null;
  tipoId: string;
  prioridadId: string;
}

export interface CreateItemCompraDto {
  descripcion: string;
  cantidad: number;
  unidad?: string | null;
  precioUnitarioRef?: number | null;
  observaciones?: string | null;
}

/** Monedas soportadas (espejo de `@IsIn(['ARS','USD','EUR'])` backend). */
export const MONEDAS = ["ARS", "USD", "EUR"] as const;
export type Moneda = (typeof MONEDAS)[number];

export interface CreatePresupuestoDto {
  proveedor: string;
  montoTotal: number;
  moneda: Moneda;
  fechaCotizacion: string;
  observaciones?: string | null;
}

export interface RechazarCompraDto {
  motivoRechazo: string;
}

/** Shape de `GET /compras/:id` (`CompraDetalleResponseDto`, item 1 — cierra G7). */
export interface CompraDetalle extends TicketCompra {
  items: ItemCompra[];
  presupuestos: Presupuesto[];
}
