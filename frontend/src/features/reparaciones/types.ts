/**
 * Reparacion domain type — mirrors the backend ReparacionEntity fields returned by GET /api/reparaciones.
 * estadoId is a bare UUID resolved client-side via the shared ESTADOS catalog map.
 * ubicacionNombre is denormalized for display (avoids a catalog endpoint round-trip).
 *
 * Spec: [SPEC:frontend-reparaciones/types]
 */
export type Reparacion = {
  id: string;
  ticketId: string;
  numero: string;              // e.g. "REP-2026-00001"
  titulo: string;
  estadoId: string;
  ubicacionId: string;
  ubicacionNombre: string | null;
  porcentajeAvance: number;    // 0–100
  createdAt: string;
  updatedAt: string;
};
