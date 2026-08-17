"use client";

/**
 * ReparacionesList — tabla de reparaciones edilicias (T5.8). Avance visible
 * vía `porcentajeAvance` (persistido server-side, sobrevive al refresh —
 * a diferencia del checklist detallado de subtareas, ver `SubtareasDialog`).
 */
import { useReparaciones } from "../hooks/use-reparaciones";
import { DataTable, type Column } from "@/components/shared/data-table";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { Can } from "@/components/shared/can";
import { notifyError } from "@/shared/lib/toast";
import { ReparacionCreateDialog } from "./reparacion-create-dialog";
import { SubtareasDialog } from "./subtareas-dialog";
import type { ReparacionListItem } from "../types";

function AvanceCell({ porcentaje }: { porcentaje: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, porcentaje))}%` }} />
      </div>
      <span className="text-xs text-muted-foreground">{porcentaje}%</span>
    </div>
  );
}

export function ReparacionesList() {
  const reparacionesQuery = useReparaciones();

  const columns: Column<ReparacionListItem>[] = [
    { key: "numero", header: "Número" },
    { key: "titulo", header: "Título" },
    { key: "ubicacion", header: "Ubicación", render: (row) => row.ubicacion ?? "—" },
    { key: "porcentajeAvance", header: "Avance", render: (row) => <AvanceCell porcentaje={row.porcentajeAvance} /> },
    {
      key: "id",
      header: "Subtareas",
      render: (row) => (
        <SubtareasDialog
          reparacionId={row.id}
          numero={row.numero}
          subtareas={row.subtareas}
          trigger={
            <Button variant="outline" size="sm">
              Ver subtareas
            </Button>
          }
        />
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Reparaciones"
        actions={
          <Can permiso="EDILICIA:ALTAS">
            <ReparacionCreateDialog />
          </Can>
        }
      />
      <DataTable
        columns={columns}
        data={reparacionesQuery.data ?? []}
        getRowKey={(row) => row.id}
        isLoading={reparacionesQuery.isLoading}
        error={reparacionesQuery.isError ? "No se pudieron cargar las reparaciones." : undefined}
        onRetry={() => reparacionesQuery.refetch().catch(notifyError)}
        emptyTitle="Sin reparaciones"
        emptyDescription="Creá la primera con «Nueva reparación»."
      />
    </div>
  );
}
