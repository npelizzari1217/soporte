"use client";

/**
 * CompraDetailView — CONTAINER montado por `/compras/[id]` (T5.3). `id` de
 * ruta = id del `Ticket` BASE (`ticketId`, mismo criterio que aprobar/
 * rechazar). Consume `GET /compras/:id` (`useCompra`, item 1 backend-gaps —
 * cierra G7) con items/presupuestos EMBEBIDOS como fuente inicial real.
 */
import { DetailSkeleton } from "@/components/shared/skeletons";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { Can } from "@/components/shared/can";
import { useCompra } from "../hooks/use-compras";
import { CompraItemsSection } from "./compra-items-section";
import { CompraPresupuestosSection } from "./compra-presupuestos-section";
import { CompraDecisionActions } from "./compra-decision-actions";

export interface CompraDetailViewProps {
  ticketId: string;
}

export function CompraDetailView({ ticketId }: CompraDetailViewProps) {
  const compraQuery = useCompra(ticketId);

  if (compraQuery.isLoading) return <DetailSkeleton />;
  if (compraQuery.isError || !compraQuery.data) {
    return (
      <ErrorState
        message="No se pudo cargar la compra."
        onRetry={() => {
          compraQuery.refetch().catch(() => {});
        }}
      />
    );
  }

  const compra = compraQuery.data;

  return (
    <Can permiso="compra:gestionar" fallback={<ErrorState message="No tenés permiso para ver esta compra." />}>
      <div className="flex flex-col gap-6">
        <PageHeader
          title={`${compra.numero} — ${compra.titulo}`}
          actions={<CompraDecisionActions compra={compra} />}
        />
        <CompraItemsSection compraId={compra.id} items={compra.items} />
        <CompraPresupuestosSection compraId={compra.id} presupuestos={compra.presupuestos} />
      </div>
    </Can>
  );
}
