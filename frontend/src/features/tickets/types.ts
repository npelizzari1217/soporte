/**
 * Ticket domain type — mirrors the backend TicketEntity fields returned by GET /api/tickets.
 * Catalog foreign keys (tipoId, estadoId, prioridadId) are bare UUIDs resolved client-side
 * via the catalogos maps to avoid round-trips to non-existent catalog endpoints.
 *
 * Spec: [SPEC:frontend-tickets/types]
 */
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
  fechaVencimiento: string | null;
  createdAt: string;
  updatedAt: string;
};
