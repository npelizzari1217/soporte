"use client";

/**
 * ComprasListView — CONTAINER montado por `/compras` (T5.2). Vista de
 * gestión completa gateada por `compra:gestionar` (defensa en profundidad,
 * mismo criterio que `CatalogosAdminView` B4 y consistente con el predicado
 * ya definido en `nav-config.ts` para el ítem "Compras" — el `GET /compras`
 * backend no exige permiso, pero esta VISTA es exclusivamente de gestión).
 */
import { useRouter } from "next/navigation";
import { useCompras } from "../hooks/use-compras";
import { DataTable, type Column } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { Can } from "@/components/shared/can";
import { ErrorState } from "@/components/shared/error-state";
import { Badge } from "@/components/ui/badge";
import { notifyError } from "@/shared/lib/toast";
import { CompraCreateDialog } from "./compra-create-dialog";
import type { TicketCompra } from "../types";

function DecisionBadge({ compra }: { compra: TicketCompra }) {
  if (!compra.aprobadoEn) return <Badge variant="secondary">Pendiente</Badge>;
  return compra.motivoRechazo ? (
    <Badge variant="destructive">Rechazada</Badge>
  ) : (
    <Badge variant="success">Aprobada</Badge>
  );
}

export function ComprasListView() {
  const router = useRouter();
  const comprasQuery = useCompras();

  const columns: Column<TicketCompra>[] = [
    { key: "numero", header: "Número" },
    { key: "titulo", header: "Título" },
    { key: "id", header: "Decisión", render: (row) => <DecisionBadge compra={row} /> },
  ];

  return (
    <Can permiso="compra:gestionar" fallback={<ErrorState message="No tenés permiso para gestionar compras." />}>
      <div>
        <PageHeader title="Compras" actions={<CompraCreateDialog />} />
        <DataTable
          columns={columns}
          data={comprasQuery.data ?? []}
          getRowKey={(row) => row.id}
          isLoading={comprasQuery.isLoading}
          error={comprasQuery.isError ? "No se pudieron cargar las compras." : undefined}
          onRetry={() => comprasQuery.refetch().catch(notifyError)}
          onRowClick={(row) => router.push(`/compras/${row.ticketId}`)}
          emptyTitle="Sin tickets de compra"
          emptyDescription="Creá el primero con «Nuevo ticket de compra»."
        />
      </div>
    </Can>
  );
}
