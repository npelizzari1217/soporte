"use client";

/**
 * ModeloEquipoList — tabla del catálogo de modelos de equipo (ABM, Admin >
 * Modelos de equipo). Activar/desactivar detrás de `ConfirmDialog` — dar de
 * baja un modelo no lo elimina (no hay borrado duro para este catálogo, ver
 * `types.ts`), solo deja de ofrecerse como opción nueva del selector en
 * equipos. Molde exacto de `features/insumos/components/unidad-medida-list.tsx`
 * (ADR-1). Sin test propio: se cubre integrado desde
 * `modelos-equipo-admin-view.test.tsx`, mismo criterio que su molde.
 */
import { Plus } from "lucide-react";
import { useModelosEquipo } from "../hooks/use-modelos-equipo";
import { useCambiarEstadoActivoModeloEquipo } from "../hooks/use-modelo-equipo-mutations";
import { DataTable, type Column } from "@/components/shared/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { notifyError } from "@/shared/lib/toast";
import { ModeloEquipoFormDialog } from "./modelo-equipo-form-dialog";
import type { ModeloEquipo } from "../types";

function EstadoActivoAction({ modelo }: { modelo: ModeloEquipo }) {
  const mutation = useCambiarEstadoActivoModeloEquipo(modelo.id);
  return (
    <ConfirmDialog
      trigger={
        <Button variant="outline" size="sm">
          {modelo.activo ? "Dar de baja" : "Activar"}
        </Button>
      }
      title={modelo.activo ? "Dar de baja modelo de equipo" : "Activar modelo de equipo"}
      description={`¿Confirmás ${modelo.activo ? "dar de baja" : "activar"} "${modelo.marca} ${modelo.modelo}"?`}
      confirmLabel={modelo.activo ? "Dar de baja" : "Activar"}
      confirmVariant={modelo.activo ? "destructive" : "default"}
      isConfirming={mutation.isPending}
      onConfirm={() => mutation.mutate({ activo: !modelo.activo })}
    />
  );
}

export function ModeloEquipoList() {
  const modelosQuery = useModelosEquipo();

  const columns: Column<ModeloEquipo>[] = [
    { key: "marca", header: "Marca" },
    { key: "modelo", header: "Modelo" },
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
          <ModeloEquipoFormDialog
            modelo={row}
            trigger={
              <Button variant="outline" size="sm">
                Editar
              </Button>
            }
          />
          <EstadoActivoAction modelo={row} />
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <ModeloEquipoFormDialog
          trigger={
            <Button size="sm">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Nuevo modelo de equipo
            </Button>
          }
        />
      </div>
      <DataTable
        columns={columns}
        data={modelosQuery.data ?? []}
        getRowKey={(row) => row.id}
        isLoading={modelosQuery.isLoading}
        error={modelosQuery.isError ? "No se pudieron cargar los modelos de equipo." : undefined}
        onRetry={() => modelosQuery.refetch().catch(notifyError)}
        emptyTitle="Sin modelos de equipo"
        emptyDescription="Creá el primero con el botón «Nuevo modelo de equipo»."
      />
    </div>
  );
}
