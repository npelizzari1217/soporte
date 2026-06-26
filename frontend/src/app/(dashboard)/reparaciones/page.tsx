"use client";

/**
 * Reparaciones list page — /reparaciones (CONTAINER)
 *
 * Owns all data-fetching state via useReparaciones() and delegates rendering to
 * ReparacionesList (presentational). Handles all four UI states:
 *   - isLoading → Skeleton rows
 *   - isError   → error message + retry Button
 *   - empty     → EmptyState
 *   - data      → PageHeader + ReparacionesList
 *
 * Design: Container/Presentational pattern per design.md §1.
 * Spec: [SPEC:frontend-reparaciones/lista-reparaciones], [SPEC:frontend-ui-states/skeleton isLoading],
 *        [SPEC:frontend-ui-states/empty-state], [SPEC:frontend-ui-states/interactive-state]
 */

import { PageHeader } from "@/components/shell/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { useReparaciones } from "@/features/reparaciones/hooks/use-reparaciones";
import { ReparacionesList } from "@/features/reparaciones/components/ReparacionesList";

export default function ReparacionesPage() {
  const { data, isLoading, isError, refetch } = useReparaciones();

  // ── Loading ───────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-4">
        <PageHeader title="Reparaciones" />
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
        <PageHeader title="Reparaciones" />
        <div className="flex flex-col items-center gap-4 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            No se pudieron cargar las reparaciones.
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
        <PageHeader title="Reparaciones" />
        <EmptyState
          title="No hay reparaciones todavía"
          description="Las reparaciones edilicias aparecerán aquí una vez que se creen."
        />
      </div>
    );
  }

  // ── Success ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <PageHeader title="Reparaciones" />
      <ReparacionesList reparaciones={data} />
    </div>
  );
}
