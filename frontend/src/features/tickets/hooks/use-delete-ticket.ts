"use client";

/**
 * useDeleteTicket — pure data mutation hook for deleting a ticket.
 *
 * ADR-3: pure data hook — mutationFn + invalidation only.
 * UI effects (toast, dialog close) live in the caller component (TicketsList).
 *
 * Variables: `id: string` — the ticket UUID to delete.
 *
 * 204 No Content → apiFetch<void> returns undefined (normalize.ts handles this:
 *   `if (res.status === 204) return undefined as T` — no body parsing, no error).
 *
 * Idempotent contract (design.md §4 Delete):
 *   Backend returns 204 for already-deleted tickets too.
 *   onSuccess invalidates tickets.all so the row disappears from the list.
 *
 * Permission: ticket:eliminar — UI gate in TicketsList; backend enforces it too (403).
 *
 * Spec: tickets-ui §req Hooks de mutación (escenarios useDeleteTicket)
 * Design: design.md §1.7 — convención de hooks de mutación
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import { queryKeys } from "@/shared/api/query-keys";
import type { ApiError } from "@/shared/api/types";

export function useDeleteTicket() {
  const qc = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: (id) => apiFetch<void>(`tickets/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.tickets.all }),
  });
}
