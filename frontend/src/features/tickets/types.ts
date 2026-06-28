/**
 * Ticket domain type — mirrors the backend TicketEntity fields returned by GET /api/tickets.
 * Catalog foreign keys (tipoId, estadoId, prioridadId) are bare UUIDs resolved client-side
 * via the catalogos maps to avoid round-trips to non-existent catalog endpoints.
 *
 * Spec: [SPEC:frontend-tickets/types]
 */

/**
 * Filter params for GET /api/tickets.
 * All fields optional — absence means "no filter" (returns all).
 * Spec: ADR-7 (tickets-list-filtros-resolucion)
 */
export type TicketFiltros = {
  tiposIds?: string[];    // UUIDs; empty/undefined = all tipos
  fechaDesde?: string;   // 'YYYY-MM-DD' inclusive, filters on created_at startOfDay
  fechaHasta?: string;   // 'YYYY-MM-DD' inclusive, filters on created_at endOfDay
};

/**
 * Active billing cycle (CicloCliente) returned by GET /api/tickets/ciclo-activo.
 * 404 when no active cycle — frontend interprets 404 as null, NOT as an error.
 * Spec: ADR-8 (tickets-list-filtros-resolucion)
 */
export type CicloActivo = {
  id: string;
  nombre: string;
  fechaInicio: string;  // 'YYYY-MM-DD'
  fechaFin: string;     // 'YYYY-MM-DD'
  activo: boolean;
};

export type Ticket = {
  id: string;
  numero: string;           // e.g. "SOP-2026-00001"
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
};
