"use client";

/**
 * EquiposListView — CONTAINER montado por `/equipos` (T5.12). "Nuevo
 * ticket de soporte" es SIEMPRE visible a quien tenga `ticket:crear`
 * (independiente del inventario); la tabla de inventario (crear/ver
 * detalle) queda gateada por `equipo:gestionar` — mismo criterio "vista de
 * gestión" que `CatalogosAdminView` (B4), pero SIN ocultar la creación de
 * tickets de soporte a quien no gestiona equipos (deviación deliberada vs.
 * B4, documentada en apply-progress).
 */
import { useRouter } from "next/navigation";
import { useEquipos } from "../hooks/use-equipos";
import { DataTable, type Column } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { Can } from "@/components/shared/can";
import { ErrorState } from "@/components/shared/error-state";
import { Badge } from "@/components/ui/badge";
import { notifyError } from "@/shared/lib/toast";
import { EquipoCreateDialog } from "./equipo-create-dialog";
import { TicketSoporteCreateDialog } from "./ticket-soporte-create-dialog";
import type { Equipo } from "../types";

export function EquiposListView() {
  const router = useRouter();
  const equiposQuery = useEquipos();

  const columns: Column<Equipo>[] = [
    { key: "nombre", header: "Nombre" },
    { key: "marca", header: "Marca", render: (row) => row.marca ?? "—" },
    { key: "numeroSerie", header: "N.º de serie", render: (row) => row.numeroSerie ?? "—" },
    {
      key: "activo",
      header: "Estado",
      render: (row) => (row.activo ? <Badge variant="success">Activo</Badge> : <Badge variant="outline">Baja</Badge>),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Equipos IT"
        actions={
          <Can permiso="ticket:crear">
            <TicketSoporteCreateDialog />
          </Can>
        }
      />
      <Can
        permiso="equipo:gestionar"
        fallback={<ErrorState message="No tenés permiso para ver el inventario de equipos." />}
      >
        <div>
          <div className="mb-3 flex justify-end">
            <EquipoCreateDialog />
          </div>
          <DataTable
            columns={columns}
            data={equiposQuery.data ?? []}
            getRowKey={(row) => row.id}
            isLoading={equiposQuery.isLoading}
            error={equiposQuery.isError ? "No se pudieron cargar los equipos." : undefined}
            onRetry={() => equiposQuery.refetch().catch(notifyError)}
            onRowClick={(row) => router.push(`/equipos/${row.id}`)}
            emptyTitle="Sin equipos"
            emptyDescription="Creá el primero con «Nuevo equipo»."
          />
        </div>
      </Can>
    </div>
  );
}
