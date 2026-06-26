/**
 * TanStack Query key factory.
 * Centralizes all query keys so invalidations and cache reads are type-safe and consistent.
 *
 * Usage:
 *   queryFn: () => apiFetch<Ticket[]>('tickets')        → key: queryKeys.tickets.all
 *   queryFn: () => apiFetch<Ticket>(`tickets/${id}`)    → key: queryKeys.tickets.detail(id)
 *
 * Spec: infrastructure for [SPEC:frontend-api-client/normalizacion-respuestas] TanStack integration
 */
export const queryKeys = {
  tickets: {
    all: ["tickets"] as const,
    detail: (id: string) => ["tickets", id] as const,
  },
  compras: {
    all: ["compras"] as const,
    detail: (id: string) => ["compras", id] as const,
  },
  reparaciones: {
    all: ["reparaciones"] as const,
    detail: (id: string) => ["reparaciones", id] as const,
  },
  equipos: {
    all: ["equipos"] as const,
    detail: (id: string) => ["equipos", id] as const,
  },
} as const;
