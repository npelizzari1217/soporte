/**
 * DTOs de entrada/salida para los controllers del módulo de reparaciones:
 * UbicacionesController, TicketsEdilicioController, SubtareasController.
 *
 * Siguiendo el patrón de compras.dto.ts: interfaces planas, sin class-validator.
 *
 * Tarea: 5.D.2
 */

// ─── Input DTOs ───────────────────────────────────────────────────────────────

/**
 * Cuerpo HTTP para POST /ubicaciones.
 */
export interface CreateUbicacionHttpDto {
  /** Nombre del espacio físico. */
  nombre: string;
  /** Descripción adicional (opcional). */
  descripcion?: string | null;
  /** UUID del nodo padre (null = nodo raíz). */
  padreId?: string | null;
}

/**
 * Cuerpo HTTP para POST /tickets-edilicio.
 * clienteId y autorId se extraen del JWT via @CurrentUser().
 */
export interface CreateTicketEdilicioHttpDto {
  titulo: string;
  descripcion?: string | null;
  /** UUID del tipo de ticket EDILICIA (FK → tipos_ticket). */
  tipoId: string;
  /** UUID de la prioridad (FK → prioridades). */
  prioridadId: string;
  /** UUID del ciclo de cliente (FK → ciclos_cliente, opcional). */
  cicloId?: string | null;
  /** UUID del solicitante (soft ref → master.usuarios). */
  solicitanteId: string;
  /** Fecha de resolución ISO (opcional). */
  fechaResolucion?: string | null;
  /** UUID de la ubicación física donde ocurre la reparación. */
  ubicacionId: string;
}

/**
 * Cuerpo HTTP para POST /tickets-edilicio/:id/subtareas.
 * autorId se extrae del JWT via @CurrentUser().
 */
export interface CreateSubtareaHttpDto {
  /** Descripción de la subtarea concreta (VARCHAR 255). */
  descripcion: string;
  /** Orden de visualización (default 0). */
  orden?: number;
}

// ─── Response DTOs ────────────────────────────────────────────────────────────

/** Shape de respuesta para una Ubicacion. */
export interface UbicacionResponseDto {
  id: string;
  nombre: string;
  descripcion: string | null;
  padreId: string | null;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Shape de respuesta para un ticket edilicio creado. */
export interface TicketEdilicioResponseDto {
  id: string;
  numero: string;
  titulo: string;
  estadoId: string;
  createdAt: string;
  updatedAt: string;
}

/** Shape de respuesta para una subtarea edilicia. */
export interface SubtareaEdiliciaResponseDto {
  id: string;
  ticketEdiliciaId: string;
  descripcion: string;
  completada: boolean;
  completadaEn: string | null;
  completadaPorId: string | null;
  orden: number;
  createdAt: string;
  updatedAt: string;
}

/** Shape de respuesta para un ítem del listado de reparaciones edilicias. */
export interface ReparacionListItemResponseDto {
  /** UUID del ticket_edilicia (satélite). */
  id: string;
  /** UUID del ticket base. */
  ticketId: string;
  /** Número legible del ticket base (ej. EDI-2026-00001). */
  numero: string;
  titulo: string;
  estadoId: string;
  /** UUID de la ubicación física asociada. */
  ubicacionId: string;
  /** Nombre de la ubicación. Null si la ubicacion no se encuentra. */
  ubicacionNombre: string | null;
  /** Porcentaje de avance derivado de las subtareas (0-100). */
  porcentajeAvance: number;
  createdAt: string;
  updatedAt: string;
}
