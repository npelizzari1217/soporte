"use client";

/**
 * Compras list page — /compras (CONTAINER)
 *
 * Owns all data-fetching state via useCompras() and delegates rendering to
 * ComprasList (presentational). Handles all four UI states:
 *   - isLoading → Skeleton rows
 *   - isError   → error message + retry Button
 *   - empty     → EmptyState
 *   - data      → PageHeader + ComprasList
 *
 * Design: Container/Presentational pattern per design.md §1.
 * Spec: [SPEC:frontend-compras/lista-compras], [SPEC:frontend-ui-states/skeleton isLoading],
 *        [SPEC:frontend-ui-states/empty-state], [SPEC:frontend-ui-states/interactive-state]
 */

import { PageHeader } from "@/components/shell/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { useCompras } from "@/features/compras/hooks/use-compras";
import { ComprasList } from "@/features/compras/components/ComprasList";

export default function ComprasPage() {
  const { data, isLoading, isError, refetch } = useCompras();

  // ── Loading ───────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="space-y-4">
        <PageHeader title="Compras" />
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
        <PageHeader title="Compras" />
        <div className="flex flex-col items-center gap-4 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            No se pudieron cargar las compras.
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
        <PageHeader title="Compras" />
        <EmptyState
          title="No hay compras todavía"
          description="Las solicitudes de compra aparecerán aquí una vez que se creen."
        />
      </div>
    );
  }

  // ── Success ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <PageHeader title="Compras" />
      <ComprasList compras={data} />
    </div>
  );
}
