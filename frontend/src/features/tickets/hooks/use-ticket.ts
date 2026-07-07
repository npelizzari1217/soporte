"use client";

/**
 * useTicket — query hook for a single ticket by id.
 *
 * Calls GET /api/tickets/:id. Mirrors useCicloActivo's contract exactly (ADR-2):
 *   - 200 → ticket data
 *   - 404 → null (ticket inexistente o de otro tenant — treated as valid state,
 *     NOT an error; backend returns 404 for both cases per menor privilegio, CLAUDE.md §7)
 *   - other errors (4xx/5xx/red) → re-thrown as ApiError
 *
 * Return shape:
 *   - data = Ticket when 200
 *   - data = null when 404 (not found / other tenant)
 *   - isError + error = ApiError when non-404 error
 *
 * The hook stays THIN (data only) — the caller (TicketDetailContainer) derives the
 * 4 UI states (loading/error/notFound/success) from isLoading/isError/data.
 * Retry is disabled for any 4xx response (hitting a resource that won't appear).
 *
 * Spec: [SPEC:ticket-detail/fetch-de-ticket-por-id-con-estados-explicitos]
 * Design: ADR-2 (ticket-detail-page)
 */

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import { queryKeys } from "@/shared/api/query-keys";
import { ApiError } from "@/shared/api/types";
import type { Ticket } from "../types";

export function useTicket(id: string) {
  return useQuery<Ticket | null, ApiError>({
    queryKey: queryKeys.tickets.detail(id),
    queryFn: async () => {
      try {
        return await apiFetch<Ticket>(`tickets/${id}`);
      } catch (err) {
        // 404 = "no encontrado o de otro tenant" — valid operational state, not an error.
        if (err instanceof ApiError && err.statusCode === 404) {
          return null;
        }
        throw err;
      }
    },
    enabled: !!id,
    retry: (count, err) =>
      !(err instanceof ApiError && err.statusCode >= 400 && err.statusCode < 500) &&
      count < 2,
  });
}
