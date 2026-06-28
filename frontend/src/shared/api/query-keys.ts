/**
 * TanStack Query key factory.
 * Centralizes all query keys so invalidations and cache reads are type-safe and consistent.
 *
 * Usage:
 *   queryFn: () => apiFetch<Ticket[]>('tickets')               → key: queryKeys.tickets.all
 *   queryFn: () => apiFetch<Ticket>(`tickets/${id}`)           → key: queryKeys.tickets.detail(id)
 *   queryFn: () => apiFetch<Ticket[]>('tickets?...')           → key: queryKeys.tickets.list(filtros)
 *   queryFn: () => apiFetch<CicloActivo>('tickets/ciclo-activo') → key: queryKeys.tickets.cicloActivo
 *
 * Cache invalidation hierarchy:
 *   queryKeys.tickets.all (["tickets"]) is the prefix for ALL ticket queries.
 *   invalidateQueries({ queryKey: queryKeys.tickets.all }) invalidates list + detail + cicloActivo.
 *   Mutation hooks MUST use .all as the invalidation root — never .list(filtros).
 *
 * Spec: ADR-7 (tickets-list-filtros-resolucion)
 */
export const queryKeys = {
  tickets: {
    /** Root key — used as prefix for all invalidations in mutation hooks. */
    all: ["tickets"] as const,
    /**
     * List key with filter discriminator. Each unique filtros object produces a distinct cache entry.
     * The filtros object MUST be stable across renders (useState/useMemo) to avoid infinite refetches.
     * ADR-7: filtros passed as 3rd element so prefix ["tickets", "list"] matches all filtered lists.
     */
    list: (filtros: object) => ["tickets", "list", filtros] as const,
    /** Ciclo activo key — single entry, no parameters. */
    cicloActivo: ["tickets", "ciclo-activo"] as const,
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
