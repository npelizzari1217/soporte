"use client";

/**
 * TicketDetailContainer — CONTAINER for /tickets/[id].
 *
 * Owns useTicket(id), derives the 4 mutually-exclusive UI states
 * (loading/error/notFound/success — ADR-2), and wires the actions toolbar
 * (Modificar/Eliminar/Imprimir + Volver) REUSING TicketFormModal(mode="edit")
 * and useDeleteTicket without refactor (ADR-3).
 *
 * The toolbar is rendered via `PageHeader`'s `actions` slot, which lives
 * OUTSIDE `TicketDetailView`'s `[data-ticket-print]` subtree (ADR-1) — so it
 * is automatically excluded from `@media print`.
 *
 * Editar: opens TicketFormModal prefilled with `ticket`. On save,
 * useUpdateTicket (inside useTicketForm) invalidates tickets.all +
 * tickets.detail(id) — useTicket(id) here refetches on its own, zero extra
 * wiring.
 *
 * Eliminar: owns confirmOpen + ConfirmDialog (same pattern as TicketsList).
 * On success: toast + redirect to /tickets. On error: toast, dialog stays
 * open so the user can retry or cancel.
 *
 * Imprimir: always visible (no permission gate) — invokes window.print().
 *
 * Design: design.md §"Estructura Container/Presentational" (TicketDetailContainer), ADR-1/2/3
 * Spec: [SPEC:ticket-detail/*]
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Printer } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useSession } from "@/shared/hooks/use-session";
import { notify } from "@/shared/lib/notify";
import { mapApiError } from "@/shared/lib/map-api-error";
import { useTicket } from "../hooks/use-ticket";
import { useDeleteTicket } from "../hooks/use-delete-ticket";
import { TicketDetailView } from "./TicketDetailView";
import { TicketFormModal } from "./TicketFormModal";

export interface TicketDetailContainerProps {
  id: string;
}

export function TicketDetailContainer({ id }: TicketDetailContainerProps) {
  const router = useRouter();
  const { can } = useSession();
  const { data: ticket, isLoading, isError, refetch } = useTicket(id);
  const deleteTicket = useDeleteTicket();

  const [editOpen, setEditOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function handleDelete() {
    try {
      await deleteTicket.mutateAsync(id);
      notify.success("Ticket eliminado");
      setConfirmOpen(false);
      router.push("/tickets");
    } catch (err) {
      notify.error(mapApiError(err));
      // confirmOpen NOT cleared → dialog stays open (user can retry or cancel)
    }
  }

  // ── Loading ──────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-4">
        <PageHeader title="Ticket" />
        <div className="space-y-3">
          <Skeleton className="h-8 w-1/3" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    );
  }

  // ── Error genérico (ApiError no-404) ────────────────────────────────────
  if (isError) {
    return (
      <div className="space-y-4">
        <PageHeader title="Ticket" />
        <div className="flex flex-col items-center gap-4 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            No se pudo cargar el ticket.
          </p>
          <Button variant="outline" onClick={() => void refetch()}>
            Reintentar
          </Button>
        </div>
      </div>
    );
  }

  // ── NotFound (data === null — inexistente u otro tenant) ────────────────
  // `!ticket` (rather than `=== null`) also narrows out `undefined`, which is
  // unreachable here in practice (isLoading/isError already handled above)
  // but keeps `ticket: Ticket` (non-nullable) for the success branch below.
  if (!ticket) {
    return (
      <div className="space-y-4">
        <PageHeader title="Ticket" />
        <EmptyState
          title="Ticket no encontrado"
          description="Puede haber sido eliminado o no tenés acceso."
          action={
            <Button onClick={() => router.push("/tickets")}>
              Volver a tickets
            </Button>
          }
        />
      </div>
    );
  }

  // ── Success ───────────────────────────────────────────────────────────────
  // The toolbar lives in PageHeader's `actions` slot — a sibling of
  // TicketDetailView, never a descendant of `[data-ticket-print]` (ADR-1).
  const toolbar = (
    <>
      <Button variant="outline" onClick={() => router.push("/tickets")}>
        Volver
      </Button>
      {can("ticket:editar") && (
        <Button variant="outline" onClick={() => setEditOpen(true)}>
          Modificar
        </Button>
      )}
      {can("ticket:eliminar") && (
        <Button variant="destructive" onClick={() => setConfirmOpen(true)}>
          Eliminar
        </Button>
      )}
      <Button variant="outline" onClick={() => window.print()}>
        <Printer className="h-4 w-4" aria-hidden />
        Imprimir
      </Button>
    </>
  );

  return (
    <div className="space-y-4">
      <PageHeader title={`Ticket ${ticket.numero}`} actions={toolbar} />

      <TicketDetailView ticket={ticket} />

      <TicketFormModal
        mode="edit"
        open={editOpen}
        onOpenChange={setEditOpen}
        ticket={ticket}
      />

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="¿Eliminar ticket?"
        description={`¿Eliminás "${ticket.titulo}"? Esta acción no se puede deshacer.`}
        onConfirm={handleDelete}
        isPending={deleteTicket.isPending}
      />
    </div>
  );
}
