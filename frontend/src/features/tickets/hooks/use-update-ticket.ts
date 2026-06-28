"use client";

/**
 * useUpdateTicket — pure data mutation hook for patching a ticket.
 *
 * ADR-3: pure data hook — mutationFn + invalidation only.
 * UI effects (toast, modal close, setError) live in useTicketForm (container).
 *
 * Variables: `{ id, dto }` — id routes the URL; dto is the partial body.
 * Both queryKeys.tickets.all AND queryKeys.tickets.detail(id) are invalidated
 * on success so both the list and any open detail view reflect the change.
 *
 * Contract: dto MUST NOT contain tipoId or estado (backend returns 422 if they appear).
 * Enforced upstream by UpdateTicketSchema (Zod strips unknown keys).
 *
 * Spec: tickets-ui §req Hooks de mutación (escenarios useUpdateTicket)
 * Design: design.md §1.7 — convención de hooks de mutación
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import { queryKeys } from "@/shared/api/query-keys";
import type { ApiError } from "@/shared/api/types";
import type { Ticket } from "../types";
import type { UpdateTicketInput } from "../schemas";

export function useUpdateTicket() {
  const qc = useQueryClient();
  return useMutation<Ticket, ApiError, { id: string; dto: UpdateTicketInput }>({
    mutationFn: ({ id, dto }) =>
      apiFetch<Ticket>(`tickets/${id}`, { method: "PATCH", json: dto }),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: queryKeys.tickets.all });
      qc.invalidateQueries({ queryKey: queryKeys.tickets.detail(id) });
    },
  });
}
