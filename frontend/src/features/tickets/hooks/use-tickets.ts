"use client";

/**
 * useTickets — query hook for the tickets list.
 *
 * Uses TanStack Query with the existing queryKeys factory (query-keys.ts).
 * apiFetch handles the BFF proxy and 401 single-flight refresh transparently.
 *
 * Design: Container/Presentational — all data-fetching lives here, not in TicketsList.
 * Spec: [SPEC:frontend-tickets/lista-tickets]
 */

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import { queryKeys } from "@/shared/api/query-keys";
import type { Ticket } from "../types";

export function useTickets() {
  return useQuery({
    queryKey: queryKeys.tickets.all,
    queryFn: () => apiFetch<Ticket[]>("tickets"),
  });
}
