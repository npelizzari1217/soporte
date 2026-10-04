/**
 * Tipos del dominio Tickets — espejo de los DTOs reales del backend
 * (`backend/src/tickets/interface/dtos/ticket.dto.ts` y `catalogo.dto.ts`,
 * `backend/src/auth/interface/dtos/usuario-tenant.dto.ts`).
 *
 * Prohibido `any` (regla base). Estos tipos son la única fuente de verdad
 * de forma en el front — los hooks (`features/tickets/hooks`) los usan como
 * genérico de `apiFetch<T>()`.
 */

import type { Modulo } from "@/shared/auth/modulo-access";

export type TicketEstadoCodigo = "NUEVO" | "ASIGNADO" | "EN_PROCESO" | "RESUELTO" | "CERRADO" | "CANCELADO";

export interface Ticket {
  id: string;
  numero: string;
  titulo: string;
  descripcion: string | null;
  tipoId: string;
  estadoId: string;
  prioridadId: string;
  cicloId: string | null;
  ticketReferenciaId: string | null;
  /** `null` si el ticket lo abrió un solicitante externo (formulario público). */
  solicitanteId: string | null;
  /** Id del solicitante externo (formulario público); `null` si lo abrió un usuario registrado. */
  solicitanteExternoId: string | null;
  solicitanteEsExterno: boolean;
  asignadoId: string | null;
  /** Resuelto batch cross-DB por el backend (sdd/beta-frontend/backend-gaps item 2). `null` = no resuelto (usuario removido del tenant). */
  solicitanteNombre: string | null;
  solicitanteApellido: string | null;
  /** `null` si `asignadoId` es `null`, o si el usuario no se pudo resolver. */
  asignadoNombre: string | null;
  asignadoApellido: string | null;
  /** Solo en el detalle: teléfono del solicitante externo (`null` si no cargó). Ausente en el listado. */
  solicitanteTelefono?: string | null;
  /** Calculado por el módulo SLA (Fase 4). `null` = sin SLA aplicable/calculado aún. */
  slaVenceAt: string | null;
  vencido: boolean;
  /**
   * Instante (no día) en que el ticket cerró — espejo de
   * `TicketResponseDto.fechaCierre` del backend, que ahora es
   * `@db.Timestamptz`, no `@db.Date`. `null` si está abierto o fue
   * reabierto. Ningún componente lo renderiza hoy (verificado); si algún
   * día se muestra el DÍA, hay que desplazar al horario argentino antes de
   * truncar — NUNCA `slice(0, 10)` sobre este ISO, que da el día UTC
   * (corregir-fecha-cierre-tickets).
   */
  fechaCierre: string | null;
  createdAt: string;
  updatedAt: string;
  /**
   * Puntaje (1-5) y comentario de la última respuesta CSAT (WU9.3, backend
   * ADR-C5/ADR-C8). AUSENTES sin `CSAT:LECTURA`, o si el TECNICO no tuvo el
   * ticket asignado — el gateo real ya lo hizo el backend; la UI ADEMÁS lo
   * esconde tras `useCan("CSAT:LECTURA")` como defensa en profundidad.
   */
  csatPuntaje?: number;
  csatComentario?: string | null;
}

export interface ListTicketsResponse {
  items: Ticket[];
  total: number;
  pagina: number;
  porPagina: number;
}

/** Filtros combinables de `GET /tickets` (espejo de `ListTicketsQueryDto`). */
export interface TicketsFiltros {
  estado?: string;
  tipo?: string;
  prioridad?: string;
  asignado?: string;
  ciclo?: string;
  fechaDesde?: string;
  fechaHasta?: string;
  busqueda?: string;
  pagina?: number;
  porPagina?: number;
}

/** Entrada del timeline de un ticket (espejo de `OperacionResponseDto`). */
export interface OperacionTicket {
  id: string;
  ticketId: string;
  tipoOperacionId: string;
  descripcion: string | null;
  estadoAnteriorId: string | null;
  estadoNuevoId: string | null;
  autorId: string;
  esInterno: boolean;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

/** Adjunto subido (espejo de `ArchivoResponseDto`; `tamanoBytes` viaja como string, no cabe en bigint JSON). */
export interface ArchivoAdjunto {
  id: string;
  storageKey: string;
  nombreOriginal: string;
  mimeType: string;
  tamanoBytes: string;
  subidoPorId: string;
  createdAt: string;
}

export interface CrearTicketDto {
  titulo: string;
  descripcion?: string | null;
  tipoId: string;
  prioridadId: string;
  ticketReferenciaId?: string | null;
}

export interface EditarTicketDto {
  titulo?: string;
  descripcion?: string | null;
  prioridadId?: string;
}

export interface ComentarioDto {
  texto: string;
  esInterno?: boolean;
}

// ─── Catálogos (G1/G4 backend read-slice, sdd/beta-frontend/design ADR-5) ───

export interface TipoTicket {
  id: string;
  codigo: string;
  nombre: string;
  /** Módulo funcional dueño del tipo (B2: separación estricta por módulo). */
  modulo: Modulo;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Prioridad {
  id: string;
  codigo: string;
  nombre: string;
  color: string | null;
  orden: number;
  activo: boolean;
  /** Horas objetivo de SLA (movido de la tabla separada `sla_config` a `prioridades`). `null` = sin SLA aplicable. */
  slaHoras: number | null;
  slaActivo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Estado {
  id: string;
  codigo: TicketEstadoCodigo;
  nombre: string;
  color: string | null;
  orden: number;
  activo: boolean;
}

/** Tipo de operación del timeline (CAMBIO_ESTADO/COMENTARIO/ASIGNACION/ADJUNTO/AVANCE_EDILICIO). */
export interface TipoOperacion {
  id: string;
  codigo: string;
  nombre: string;
  activo: boolean;
}

/** Usuario asignable del tenant (G2, `GET /usuarios`). `email` solo si el actor es ADMINISTRADOR o ROOT (R10). */
export interface UsuarioAsignable {
  id: string;
  nombre: string;
  apellido: string;
  rol: string;
  email?: string;
}

/**
 * Técnico elegible para atender un ticket (espejo de `TecnicoAsignable` del
 * backend, `GET /tickets/:id/asignables`). Ya viene filtrado por el módulo del
 * tipo del ticket — el combo lo muestra tal cual.
 */
export interface TecnicoAsignable {
  id: string;
  nombre: string;
  apellido: string;
}

/**
 * Equipo vinculado a un ticket de soporte (espejo de `EquipoDeTicketResponseDto`
 * del backend, `GET /soporte/:ticketId`). `equipo: null` = el ticket no tiene
 * satélite `ticket_soporte` o no tiene equipo asociado (ej. problemas de red/accesos).
 */
export interface EquipoDeTicket {
  id: string;
  nombre: string;
  numeroSerie: string | null;
}

export interface EquipoDeTicketResponse {
  equipo: EquipoDeTicket | null;
}
