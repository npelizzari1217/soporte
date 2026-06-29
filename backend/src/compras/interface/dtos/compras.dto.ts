/**
 * DTOs de entrada/salida para ComprasController, ItemsCompraController y PresupuestosController.
 *
 * Siguiendo el patrón de tickets.dto.ts: interfaces planas, sin class-validator.
 *
 * Tarea: 4.D.2
 */

// ─── Input DTOs ───────────────────────────────────────────────────────────────

/**
 * Cuerpo HTTP para POST /compras.
 * clienteId y autorId se extraen del JWT via @CurrentUser().
 */
export interface CreateTicketCompraHttpDto {
  titulo: string;
  descripcion?: string | null;
  /** UUID del tipo de ticket COMPRAS (FK → tipos_ticket). */
  tipoId: string;
  /** UUID de la prioridad (FK → prioridades). */
  prioridadId: string;
  /** UUID del ciclo de cliente (FK → ciclos_cliente, opcional). */
  cicloId?: string | null;
  /** UUID del solicitante (soft ref → master.usuarios). */
  solicitanteId: string;
  /** Fecha de resolución ISO (opcional). */
  fechaCierre?: string | null;
}

/**
 * Cuerpo HTTP para POST /compras/:id/rechazar.
 * aprobadoPorId se extrae del JWT via @CurrentUser().
 */
export interface RechazarCompraHttpDto {
  /** Texto explicativo del motivo del rechazo. Requerido. */
  motivoRechazo: string;
}

/**
 * Cuerpo HTTP para POST /compras/:compraId/items.
 */
export interface CreateItemCompraHttpDto {
  descripcion: string;
  cantidad: number;
  unidad?: string | null;
  precioUnitarioRef?: number | null;
  observaciones?: string | null;
}

/**
 * Cuerpo HTTP para POST /compras/:compraId/presupuestos.
 */
export interface CreatePresupuestoHttpDto {
  proveedor: string;
  montoTotal: number;
  /** Código ISO 4217: ARS, USD, EUR. */
  moneda: string;
  /** Fecha de cotización en formato ISO (YYYY-MM-DD). */
  fechaCotizacion: string;
  observaciones?: string | null;
}

// ─── Response DTOs ────────────────────────────────────────────────────────────

/** Shape de respuesta para un TicketCompra (el satélite base). */
export interface TicketCompraResponseDto {
  /** UUID del ticket_compra. */
  id: string;
  /** UUID del ticket base (relación 1:1). */
  ticketId: string;
  /** UUID del usuario aprobador/rechazador (null hasta la decisión). */
  aprobadoPorId: string | null;
  /** Timestamp de la decisión en ISO (null hasta la decisión). */
  aprobadoEn: string | null;
  /** Motivo del rechazo (null si no fue rechazado). */
  motivoRechazo: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Shape de respuesta para un TicketCompra con los datos del ticket base. */
export interface TicketCompraConTicketResponseDto extends TicketCompraResponseDto {
  /** Número legible del ticket base (ej. COM-2026-00001). */
  numero: string;
  titulo: string;
  estadoId: string;
}

/** Shape de respuesta para un ItemCompra. */
export interface ItemCompraResponseDto {
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

/** Shape de respuesta para un Presupuesto. */
export interface PresupuestoResponseDto {
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
