"use client";

/**
 * SectorList — tabla del catálogo de sectores (WU-31,
 * `compras-tres-etapas-y-sectores` R10, S63-S65). Activar/desactivar detrás
 * de `ConfirmDialog` — dar de baja un sector no borra las compras que ya lo
 * usan (el backend lo protege con `RESTRICT` en el FK), solo deja de
 * ofrecerse para compras nuevas. Mismo patrón que
 * `features/catalogos/components/tipo-ticket-list.tsx`.
 */
import { Plus } from "lucide-react";
import { useSectores } from "../hooks/use-sectores";
import { useCambiarEstadoActivoSector } from "../hooks/use-sector-mutations";
import { DataTable, type Column } from "@/components/shared/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { notifyError } from "@/shared/lib/toast";
import { SectorFormDialog } from "./sector-form-dialog";
import type { Sector } from "../types";

function EstadoActivoAction({ sector }: { sector: Sector }) {
  const mutation = useCambiarEstadoActivoSector(sector.id);
  return (
    <ConfirmDialog
      trigger={
        <Button variant="outline" size="sm">
          {sector.activo ? "Dar de baja" : "Activar"}
        </Button>
      }
      title={sector.activo ? "Dar de baja sector" : "Activar sector"}
      description={`¿Confirmás ${sector.activo ? "dar de baja" : "activar"} "${sector.nombre}"?`}
      confirmLabel={sector.activo ? "Dar de baja" : "Activar"}
      confirmVariant={sector.activo ? "destructive" : "default"}
      isConfirming={mutation.isPending}
      onConfirm={() => mutation.mutate({ activo: !sector.activo })}
    />
  );
}

export function SectorList() {
  const sectoresQuery = useSectores();

  const columns: Column<Sector>[] = [
    { key: "codigo", header: "Código" },
    { key: "nombre", header: "Nombre" },
    {
      key: "activo",
      header: "Estado",
      render: (row) =>
        row.activo ? <Badge variant="success">Activo</Badge> : <Badge variant="outline">Baja</Badge>,
    },
    {
      key: "id",
      header: "Acciones",
      render: (row) => (
        <div className="flex items-center gap-2">
          <SectorFormDialog
            sector={row}
            trigger={
              <Button variant="outline" size="sm">
                Editar
              </Button>
            }
          />
          <EstadoActivoAction sector={row} />
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <SectorFormDialog
          trigger={
            <Button size="sm">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Nuevo sector
            </Button>
          }
        />
      </div>
      <DataTable
        columns={columns}
        data={sectoresQuery.data ?? []}
        getRowKey={(row) => row.id}
        isLoading={sectoresQuery.isLoading}
        error={sectoresQuery.isError ? "No se pudieron cargar los sectores." : undefined}
        onRetry={() => sectoresQuery.refetch().catch(notifyError)}
        emptyTitle="Sin sectores"
        emptyDescription="Creá el primero con el botón «Nuevo sector»."
      />
    </div>
  );
}
