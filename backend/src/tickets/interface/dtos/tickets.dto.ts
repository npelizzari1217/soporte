/**
 * DTOs de entrada/salida para TicketsController y OperacionesController.
 *
 * Siguiendo el patrón de auth.dto.ts: interfaces planas, sin class-validator.
 * La validación con class-validator se añade en un PR posterior si se requiere.
 *
 * Tarea: 3.E.2
 */
import { CicloClienteEntity } from '../../domain/entities/ciclo-cliente.entity';

// ─── Input DTOs ───────────────────────────────────────────────────────────────

/**
 * Query params para GET /tickets.
 * Los valores llegan como strings desde la URL; el controller coerce y valida.
 *
 * tiposIds puede llegar como string único (?tiposIds=uuid) o como array
 * (?tiposIds[]=uuid1&tiposIds[]=uuid2). El controller normaliza a string[].
 */
export interface ListarTicketsQueryDto {
  tiposIds?: string | string[];
  /** Fecha ISO 'YYYY-MM-DD'. Controller convierte a Date con startOfDay. */
  fechaDesde?: string;
  /** Fecha ISO 'YYYY-MM-DD'. Controller convierte a Date con endOfDay. */
  fechaHasta?: string;
}

/**
 * Respuesta del endpoint GET /tickets/ciclo-activo.
 * Retorna HTTP 404 si no hay ciclo activo (spec toma precedencia sobre ADR-2).
 */
export interface CicloActivoResponseDto {
  id: string;
  nombre: string;
  /** Fecha ISO 'YYYY-MM-DD'. */
  fechaInicio: string;
  /** Fecha ISO 'YYYY-MM-DD'. */
  fechaFin: string;
  activo: boolean;
}

/**
 * Mapea un CicloClienteEntity al DTO de respuesta HTTP.
 * Las fechas se formatean como 'YYYY-MM-DD' (sin componente de hora).
 */
export function toCicloActivoResponse(ciclo: CicloClienteEntity): CicloActivoResponseDto {
  return {
    id: ciclo.id,
    nombre: ciclo.nombre,
    fechaInicio: ciclo.fechaInicio.toISOString().slice(0, 10),
    fechaFin: ciclo.fechaFin.toISOString().slice(0, 10),
    activo: ciclo.activo,
  };
}

/**
 * Cuerpo HTTP para POST /tickets.
 * Los campos clienteId, autorId y anio se extraen del JWT via @CurrentUser().
 */
export interface CreateTicketHttpDto {
  titulo: string;
  descripcion?: string | null;
  /** UUID del tipo de ticket (FK → tipos_ticket). */
  tipoId: string;
  /** UUID de la prioridad (FK → prioridades). */
  prioridadId: string;
  /** UUID del ciclo de cliente (FK → ciclos_cliente, opcional). */
  cicloId?: string | null;
  /** UUID del solicitante (soft ref → master.usuarios). */
  solicitanteId: string;
}

/**
 * Cuerpo HTTP para PATCH /tickets/:id/estado.
 */
export interface TransicionarEstadoHttpDto {
  /** Código semántico del estado destino (ej. 'EN_PROGRESO', 'CERRADO'). */
  nuevoEstadoCodigo: string;
}

/**
 * Cuerpo HTTP para POST /tickets/:id/asignar.
 */
export interface AsignarTicketHttpDto {
  /** UUID del usuario a asignar (soft ref → master.usuarios). */
  asignadoId: string;
}

// ─── Response DTOs ────────────────────────────────────────────────────────────

/**
 * Cuerpo HTTP para PATCH /tickets/:id.
 * Todos los campos son opcionales (partial update semántico).
 * SIN tipoId (locked decision L1 — número derivado del tipo original).
 * SIN estado — la transición usa el endpoint PATCH /tickets/:id/estado.
 *
 */
export interface UpdateTicketHttpDto {
  titulo?: string;
  descripcion?: string | null;
  prioridadId?: string;
  cicloId?: string | null;
}

/** Shape de respuesta para un Ticket. */
export interface TicketResponseDto {
  id: string;
  numero: string;
  titulo: string;
  descripcion: string | null;
  tipoId: string;
  estadoId: string;
  prioridadId: string;
  cicloId: string | null;
  solicitanteId: string;
  asignadoId: string | null;
  fechaResolucion: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Shape de respuesta para un Archivo adjunto. */
export interface ArchivoResponseDto {
  id: string;
  storageKey: string;
  nombreOriginal: string;
  mimeType: string;
  /** BigInt serializado como string para evitar pérdida de precisión en JSON. */
  tamanoBytes: string;
  subidoPorId: string;
  createdAt: string;
}

/** Shape de respuesta para una OperacionTicket (entrada de timeline). */
export interface OperacionTicketResponseDto {
  id: string;
  ticketId: string;
  tipoOperacionId: string;
  descripcion: string | null;
  estadoAnteriorId: string | null;
  estadoNuevoId: string | null;
  autorId: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}
