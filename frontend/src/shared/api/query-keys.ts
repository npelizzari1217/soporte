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
  admin: {
    /** GET /clientes — solo operador global. Root key, sin discriminador. */
    clientes: ["admin", "clientes"] as const,
    /**
     * GET /ciclos — discriminado por clienteId porque el tenant resuelto (propio o
     * cross-tenant vía X-Tenant-Id) cambia la respuesta. `clienteId: null` = tenant
     * propio del usuario (ADMINISTRADOR) o "sin cliente elegido" (operador).
     */
    ciclos: (clienteId: string | null) => ["admin", "ciclos", clienteId] as const,
    /**
     * Reportes — 4 agregaciones de solo lectura, discriminadas por cicloId porque
     * cada ciclo tiene su propio conjunto de datos (admin-general PR6d).
     */
    reportes: {
      porUsuario: (cicloId: string | null) => ["admin", "reportes", "por-usuario", cicloId] as const,
      porTipo: (cicloId: string | null) => ["admin", "reportes", "por-tipo", cicloId] as const,
      porEstado: (cicloId: string | null) => ["admin", "reportes", "por-estado", cicloId] as const,
      tiempoResolucion: (cicloId: string | null) =>
        ["admin", "reportes", "tiempo-resolucion", cicloId] as const,
    },
  },
} as const;
