"use client";

/**
 * useCreateTicket — pure data mutation hook for creating a ticket.
 *
 * ADR-3: this hook is pure data (mutationFn + invalidation only).
 * UI effects (toast, modal close, rhf reset, setError) live in the container
 * hook (useTicketForm), not here. This makes the hook reusable across any consumer.
 *
 * solicitanteId is part of CreateTicketInput (the DTO sent to the API) but is
 * NOT derived here — the caller (useTicketForm) injects it from useSession().user.sub.
 *
 * Spec: tickets-ui §req Hooks de mutación (escenarios useCreateTicket)
 * Design: design.md §1.7 — convención de hooks de mutación
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import { queryKeys } from "@/shared/api/query-keys";
import type { ApiError } from "@/shared/api/types";
import type { Ticket } from "../types";
import type { CreateTicketInput } from "../schemas";

export function useCreateTicket() {
  const qc = useQueryClient();
  return useMutation<Ticket, ApiError, CreateTicketInput>({
    mutationFn: (dto) =>
      apiFetch<Ticket>("tickets", { method: "POST", json: dto }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: queryKeys.tickets.all }),
  });
}
