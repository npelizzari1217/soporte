"use client";

/**
 * useTickets — query hook for the tickets list with optional filter params.
 *
 * Accepts a `filtros` object (TicketFiltros) and an `enabled` flag.
 * The filtros are serialized as query params appended to GET /api/tickets.
 *
 * IMPORTANT — queryKey stability (ADR-7):
 *   The `filtros` object is included in the queryKey. Passing a new object on
 *   every render would bust the cache on every render. The CONTAINER is responsible
 *   for keeping the filtros reference stable via useState or useMemo.
 *
 * Cache invalidation:
 *   Mutation hooks use `queryKeys.tickets.all` (["tickets"]) as invalidation root.
 *   TanStack Query prefix-matches ["tickets"] against ["tickets","list",filtros],
 *   so all filtered lists are invalidated on create/update/delete.
 *
 * Design: Container/Presentational — all data-fetching lives here, not in TicketsList.
 * Spec: ADR-7 (tickets-list-filtros-resolucion)
 */

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import { queryKeys } from "@/shared/api/query-keys";
import type { Ticket, TicketFiltros } from "../types";

/**
 * Builds the query string from a TicketFiltros object.
 * tiposIds are appended as REPEATED `tiposIds` params (NO brackets): `?tiposIds=a&tiposIds=b`.
 * El query parser de Express NO mapea `tiposIds[]` a `q.tiposIds` (queda como key literal
 * `tiposIds[]` → el filtro se ignora). Repetir `tiposIds` sí lo coerce a array en el backend.
 * Empty filtros → empty string (no query string appended).
 */
function toQueryString(filtros: TicketFiltros): string {
  const params = new URLSearchParams();
  filtros.tiposIds?.forEach((id) => params.append("tiposIds", id));
  if (filtros.fechaDesde) params.set("fechaDesde", filtros.fechaDesde);
  if (filtros.fechaHasta) params.set("fechaHasta", filtros.fechaHasta);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/**
 * @param filtros - Filter and date-range params. Must be a stable reference
 *   (from useState/useMemo in the container) to avoid infinite refetch loops.
 * @param enabled - When false, the query is suspended (no fetch). Defaults to true.
 *   Use false when a prerequisite (e.g. ciclo activo) is not yet resolved.
 */
export function useTickets(filtros: TicketFiltros = {}, enabled = true) {
  return useQuery({
    queryKey: queryKeys.tickets.list(filtros),
    queryFn: () => apiFetch<Ticket[]>(`tickets${toQueryString(filtros)}`),
    enabled,
  });
}
