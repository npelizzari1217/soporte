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
 *
 * `cicloId` fue REMOVIDO (Fase 4, ciclos-master-tenant, ADR-3): el ciclo del
 * ticket nuevo lo determina el servidor (ciclo ACTIVO del tenant), nunca el
 * cliente. Nota de ejecución (1.5, Fase 4 PR1): el `ValidationPipe` global
 * (`whitelist: true, transform: true`, sin `forbidNonWhitelisted`) SALTEA la
 * validación/whitelist para DTOs que son interfaces TS planas (metatype ===
 * Object) — un `cicloId` sobrante en el body pasa tal cual sin error 400 y
 * sin ser aplicado (el use case ya no lo lee).
 */
export interface CreateTicketEdilicioHttpDto {
  titulo: string;
  descripcion?: string | null;
  /** UUID del tipo de ticket EDILICIA (FK → tipos_ticket). */
  tipoId: string;
  /** UUID de la prioridad (FK → prioridades). */
  prioridadId: string;
  /** UUID del solicitante (soft ref → master.usuarios). */
  solicitanteId: string;
  /** Fecha de resolución ISO (opcional). */
  fechaCierre?: string | null;
  /** UUID de la ubicación física donde ocurre la reparación. */
  ubicacionId: string;
}

/**
 * Query params para GET /reparaciones.
 *
 * `cicloId` (Fase 4, ciclos-master-tenant, ADR-5): opcional. Sin especificar,
 * el use case filtra por el ciclo ACTIVO del tenant. Con valor explícito,
 * permite consultar el histórico de un ciclo cerrado.
 */
export interface ListarReparacionesQueryDto {
  cicloId?: string;
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
