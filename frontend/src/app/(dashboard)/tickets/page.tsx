"use client";

/**
 * Tickets list page — /tickets (CONTAINER)
 *
 * Owns the ciclo activo query, the filtros state, and the create/edit modal state.
 * Delegates all rendering to presentational children.
 *
 * Data flow:
 *   1. useCicloActivo → determines whether the list is available.
 *      - Loading  → full skeleton
 *      - null     → blocking alert "no hay ciclo activo"; useTickets disabled
 *      - CicloActivo → default date range set once via useEffect; useTickets enabled
 *
 *   2. filtros state → passed to useTickets (queryKey) + FiltrosBar (controlled).
 *      Initialized empty; seeded with ciclo dates on first load (one-shot useEffect).
 *      The filtros object is stable (useState) so TanStack Query doesn't re-fetch on
 *      every render. ADR-7.
 *
 *   3. useTickets(filtros, enabled) → raw ticket data, loading/error states.
 *
 * Design: Container/Presentational per design.md §1; CONSTITUTION §3 glassmorphism.
 * Spec: ADR-7, ADR-8 (tickets-list-filtros-resolucion)
 */

import { useState, useEffect, useRef } from "react";
import { PageHeader } from "@/components/shell/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { useSession } from "@/shared/hooks/use-session";
import { TIPOS } from "@/shared/lib/catalogos";
import { useTickets } from "@/features/tickets/hooks/use-tickets";
import { useCicloActivo } from "@/features/tickets/hooks/use-ciclo-activo";
import { TicketsList } from "@/features/tickets/components/TicketsList";
import { TicketFormModal } from "@/features/tickets/components/TicketFormModal";
import { FiltrosBar } from "@/features/tickets/components/FiltrosBar";
import type { Ticket, TicketFiltros } from "@/features/tickets/types";

/** Static catalog array passed to FiltrosBar — computed once at module load. */
const tiposDisponibles = Object.entries(TIPOS).map(([id, nombre]) => ({
  id,
  nombre,
}));

export default function TicketsPage() {
  const { can } = useSession();

  // ── Ciclo activo ────────────────────────────────────────────────────────────
  const {
    data: ciclo,
    isLoading: loadingCiclo,
    isError: cicloError,
  } = useCicloActivo();

  // ── Filtros state ───────────────────────────────────────────────────────────
  // Initialized to empty. A one-shot effect seeds the default date range from
  // the ciclo once it loads. After that the user controls filtros via FiltrosBar.
  const [filtros, setFiltros] = useState<TicketFiltros>({});
  const cicloFechasSetRef = useRef(false);

  useEffect(() => {
    if (ciclo && !cicloFechasSetRef.current) {
      cicloFechasSetRef.current = true;
      setFiltros({ fechaDesde: ciclo.fechaInicio, fechaHasta: ciclo.fechaFin });
    }
  }, [ciclo]);

  // ── Tickets query ───────────────────────────────────────────────────────────
  // Disabled until the ciclo query has resolved (avoids fetching with no date
  // range while we know the ciclo will provide sensible defaults). ADR-8.
  const enabled = !!ciclo && !loadingCiclo;
  const {
    data,
    isLoading: loadingTickets,
    isError,
    refetch,
  } = useTickets(filtros, enabled);

  // ── defaultTipoId — ADR-9 ────────────────────────────────────────────────────
  // Pre-fills tipoId in the create form when exactly 1 tipo is active in the filter.
  // With 0 (todos) or 2+ tipos selected → "" (form starts empty).
  const defaultTipoId =
    filtros.tiposIds?.length === 1 ? filtros.tiposIds[0] : "";

  // ── Modal state ─────────────────────────────────────────────────────────────
  const [createOpen, setCreateOpen] = useState(false);
  const [editTicket, setEditTicket] = useState<Ticket | null>(null);

  const modals = (
    <>
      <TicketFormModal
        mode="create"
        open={createOpen}
        onOpenChange={setCreateOpen}
        defaultTipoId={defaultTipoId}
      />
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

  // ── FiltrosBar — shared across most render branches ─────────────────────────
  const filtrosBar = (
    <FiltrosBar
      filtros={filtros}
      onChange={setFiltros}
      ciclo={ciclo ?? null}
      isLoadingCiclo={loadingCiclo}
      tiposDisponibles={tiposDisponibles}
    />
  );

  // ── State: ciclo loading ─────────────────────────────────────────────────────
  // Show a full skeleton (FiltrosBar + 5 ticket rows) while waiting for ciclo.
  if (loadingCiclo) {
    return (
      <div className="space-y-4">
        <PageHeader title="Tickets" />
        <div className="space-y-3">
          {/* FiltrosBar skeleton — full width */}
          <Skeleton className="h-12 w-full rounded-lg" />
          {/* Ticket row skeletons */}
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      </div>
    );
  }

  // ── State: no ciclo activo (or ciclo query error) ─────────────────────────────
  // Show a blocking alert. The list is hidden and useTickets is disabled (enabled=false).
  if (cicloError || ciclo === null) {
    return (
      <div className="space-y-4">
        <PageHeader title="Tickets" />
        {filtrosBar}
        <div
          role="alert"
          className={[
            "flex flex-col items-center gap-3 rounded-lg border p-8 text-center",
            "border-amber-500/20 bg-amber-500/5 dark:bg-amber-500/10",
          ].join(" ")}
        >
          <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
            No hay ciclo activo
          </p>
          <p className="text-xs text-muted-foreground max-w-sm">
            No se puede ver el listado de tickets sin un ciclo activo configurado.
            Contactá al administrador para configurar el ciclo del período actual.
          </p>
        </div>
      </div>
    );
  }

  // ── State: ciclo present — tickets loading ────────────────────────────────────
  if (loadingTickets) {
    return (
      <div className="space-y-4">
        <PageHeader title="Tickets" />
        {filtrosBar}
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

  // ── State: error fetching tickets ─────────────────────────────────────────────
  if (isError) {
    return (
      <div className="space-y-4">
        <PageHeader title="Tickets" />
        {filtrosBar}
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

  // ── State: empty list ─────────────────────────────────────────────────────────
  if (!data || data.length === 0) {
    return (
      <div className="space-y-4">
        <PageHeader title="Tickets" />
        {filtrosBar}
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

  // ── State: success ────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <PageHeader title="Tickets" />
      {filtrosBar}
      <TicketsList
        tickets={data}
        onOpenCreate={() => setCreateOpen(true)}
        onOpenEdit={(ticket) => setEditTicket(ticket)}
      />
      {modals}
    </div>
  );
}
