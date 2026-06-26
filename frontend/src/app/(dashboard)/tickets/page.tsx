"use client";

/**
 * Tickets list page — /tickets (CONTAINER)
 *
 * Owns all data-fetching state via useTickets() and delegates rendering to
 * TicketsList (presentational). Handles all four UI states:
 *   - isLoading → Skeleton rows
 *   - isError   → error message + retry Button
 *   - empty     → EmptyState
 *   - data      → PageHeader + TicketsList
 *
 * Design: Container/Presentational pattern per design.md §1.
 * Spec: [SPEC:frontend-tickets/lista-tickets], [SPEC:frontend-ui-states/skeleton isLoading],
 *        [SPEC:frontend-ui-states/empty-state], [SPEC:frontend-ui-states/interactive-state]
 */

import { PageHeader } from "@/components/shell/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { useTickets } from "@/features/tickets/hooks/use-tickets";
import { TicketsList } from "@/features/tickets/components/TicketsList";

export default function TicketsPage() {
  const { data, isLoading, isError, refetch } = useTickets();

  // ── Loading ───────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-4">
        <PageHeader title="Tickets" />
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (isError) {
    return (
      <div className="space-y-4">
        <PageHeader title="Tickets" />
        <div className="flex flex-col items-center gap-4 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            No se pudieron cargar los tickets.
          </p>
          <Button variant="outline" onClick={() => void refetch()}>
            Reintentar
          </Button>
        </div>
      </div>
    );
  }

  // ── Empty ─────────────────────────────────────────────────────────────────
  if (!data || data.length === 0) {
    return (
      <div className="space-y-4">
        <PageHeader title="Tickets" />
        <EmptyState
          title="No hay tickets todavía"
          description="Cuando se creen tickets, los verás acá."
        />
      </div>
    );
  }

  // ── Success ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <PageHeader title="Tickets" />
      <TicketsList tickets={data} />
    </div>
  );
}
