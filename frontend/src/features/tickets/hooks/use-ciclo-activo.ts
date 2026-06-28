"use client";

/**
 * useCicloActivo — query hook for the active billing cycle.
 *
 * Calls GET /api/tickets/ciclo-activo.
 * The endpoint returns:
 *   - 200 → active CicloActivo data
 *   - 404 → no active cycle (treated as valid state, NOT an error)
 *   - other errors → re-thrown as ApiError
 *
 * Return shape:
 *   - data = CicloActivo when 200
 *   - data = null when 404 (no cycle)
 *   - isError + error = ApiError when non-404 error
 *
 * The caller (TicketsPage container) renders a blocking alert when data === null,
 * and disables useTickets until a cycle is present.
 *
 * Spec: ADR-8 (tickets-list-filtros-resolucion)
 */

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import { queryKeys } from "@/shared/api/query-keys";
import { ApiError } from "@/shared/api/types";
import type { CicloActivo } from "../types";

export function useCicloActivo() {
  return useQuery<CicloActivo | null, ApiError>({
    queryKey: queryKeys.tickets.cicloActivo,
    queryFn: async () => {
      try {
        return await apiFetch<CicloActivo>("tickets/ciclo-activo");
      } catch (err) {
        // 404 = "no active cycle" — valid operational state, not an error.
        // Return null so the caller can render the "no hay ciclo" UI branch.
        if (err instanceof ApiError && err.statusCode === 404) {
          return null;
        }
        throw err;
      }
    },
  });
}
