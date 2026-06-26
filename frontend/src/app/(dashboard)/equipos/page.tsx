"use client";

/**
 * Equipos list page — /equipos (CONTAINER)
 *
 * Owns all data-fetching state via useEquipos() and delegates rendering to
 * EquiposList (presentational). Handles all four UI states:
 *   - isLoading → Skeleton rows
 *   - isError   → error message + retry Button
 *   - empty     → EmptyState
 *   - data      → PageHeader + EquiposList
 *
 * Design: Container/Presentational pattern per design.md §1.
 * Spec: [SPEC:frontend-equipos/lista-equipos], [SPEC:frontend-ui-states/skeleton isLoading],
 *        [SPEC:frontend-ui-states/empty-state], [SPEC:frontend-ui-states/interactive-state]
 */

import { PageHeader } from "@/components/shell/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { useEquipos } from "@/features/equipos/hooks/use-equipos";
import { EquiposList } from "@/features/equipos/components/EquiposList";

export default function EquiposPage() {
  const { data, isLoading, isError, refetch } = useEquipos();

  // ── Loading ───────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-4">
        <PageHeader title="Equipos" />
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
        <PageHeader title="Equipos" />
        <div className="flex flex-col items-center gap-4 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            No se pudieron cargar los equipos.
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
        <PageHeader title="Equipos" />
        <EmptyState
          title="No hay equipos registrados"
          description="Los equipos e inventario aparecerán aquí una vez que se registren."
        />
      </div>
    );
  }

  // ── Success ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <PageHeader title="Equipos" />
      <EquiposList equipos={data} />
    </div>
  );
}
