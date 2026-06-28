"use client";

/**
 * Tickets list page — /tickets (CONTAINER)
 *
 * Owns all data-fetching state via useTickets() and the create/edit modal state,
 * delegating rendering to TicketsList (presentational). Handles all four UI states:
 *   - isLoading → Skeleton rows
 *   - isError   → error message + retry Button
 *   - empty     → EmptyState (+ "Nuevo ticket" to create the first one)
 *   - data      → PageHeader + TicketsList
 *
 * The create/edit modals (<TicketFormModal>) are owned HERE and wired to TicketsList
 * via onOpenCreate/onOpenEdit. (Delete is owned internally by TicketsList.)
 *
 * Design: Container/Presentational pattern per design.md §1.
 * Spec: [SPEC:tickets-ui/Formulario de creación], [SPEC:tickets-ui/Formulario de edición]
 */

import { useState } from "react";
import { PageHeader } from "@/components/shell/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { useSession } from "@/shared/hooks/use-session";
import { useTickets } from "@/features/tickets/hooks/use-tickets";
import { TicketsList } from "@/features/tickets/components/TicketsList";
import { TicketFormModal } from "@/features/tickets/components/TicketFormModal";
import type { Ticket } from "@/features/tickets/types";

export default function TicketsPage() {
  const { data, isLoading, isError, refetch } = useTickets();
  const { can } = useSession();

  // Create/edit modal state lives here (the container); TicketsList delegates via callbacks.
  const [createOpen, setCreateOpen] = useState(false);
  const [editTicket, setEditTicket] = useState<Ticket | null>(null);

  // Modals rendered regardless of list state so "Nuevo" works even from the empty state.
  const modals = (
    <>
      <TicketFormModal mode="create" open={createOpen} onOpenChange={setCreateOpen} />
      {editTicket && (
        <TicketFormModal
          mode="edit"
          open
          onOpenChange={(open) => {
            if (!open) setEditTicket(null);
          }}
          ticket={editTicket}
        />
      )}
    </>
  );

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
          action={
            can("ticket:crear") ? (
              <Button onClick={() => setCreateOpen(true)}>Nuevo ticket</Button>
            ) : undefined
          }
        />
        {modals}
      </div>
    );
  }

  // ── Success ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <PageHeader title="Tickets" />
      <TicketsList
        tickets={data}
        onOpenCreate={() => setCreateOpen(true)}
        onOpenEdit={(ticket) => setEditTicket(ticket)}
      />
      {modals}
    </div>
  );
}
