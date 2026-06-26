/**
 * Compra domain type — mirrors the backend CompraEntity fields returned by GET /api/compras.
 * estadoId is a bare UUID resolved client-side via the shared ESTADOS catalog map.
 *
 * Spec: [SPEC:frontend-compras/types]
 */
export type Compra = {
  id: string;
  ticketId: string;
  numero: string;              // e.g. "CMP-2026-00001"
  titulo: string;
  estadoId: string;
  aprobadoPorId: string | null;
  aprobadoEn: string | null;   // ISO date string when approved
  motivoRechazo: string | null;
  createdAt: string;
  updatedAt: string;
};
