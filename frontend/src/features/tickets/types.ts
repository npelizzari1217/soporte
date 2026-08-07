/**
 * Tipos del dominio Tickets — espejo de los DTOs reales del backend
 * (`backend/src/tickets/interface/dtos/ticket.dto.ts` y `catalogo.dto.ts`,
 * `backend/src/auth/interface/dtos/usuario-tenant.dto.ts`).
 *
 * Prohibido `any` (regla base). Estos tipos son la única fuente de verdad
 * de forma en el front — los hooks (`features/tickets/hooks`) los usan como
 * genérico de `apiFetch<T>()`.
 */

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
  solicitanteId: string;
  asignadoId: string | null;
  /** Resuelto batch cross-DB por el backend (sdd/beta-frontend/backend-gaps item 2). `null` = no resuelto (usuario removido del tenant). */
  solicitanteNombre: string | null;
  solicitanteApellido: string | null;
  /** `null` si `asignadoId` es `null`, o si el usuario no se pudo resolver. */
  asignadoNombre: string | null;
  asignadoApellido: string | null;
  /** Calculado por el módulo SLA (Fase 4). `null` = sin SLA aplicable/calculado aún. */
  slaVenceAt: string | null;
  vencido: boolean;
  fechaCierre: string | null;
  createdAt: string;
  updatedAt: string;
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

/** Usuario asignable del tenant (G2, `GET /usuarios`). `email` solo si el actor tiene `usuario:gestionar`. */
export interface UsuarioAsignable {
  id: string;
  nombre: string;
  apellido: string;
  rol: string;
  email?: string;
}
