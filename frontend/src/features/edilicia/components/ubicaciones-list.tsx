"use client";

/**
 * UbicacionesList — tabla de ubicaciones físicas (T5.7). Gate
 * `catalogo:gestionar`. Baja lógica detrás de `ConfirmDialog` (elimina en
 * cascada todo el subárbol, ver JSDoc de `UbicacionesController` backend).
 */
import { Plus } from "lucide-react";
import { useUbicaciones } from "../hooks/use-ubicaciones";
import { useEliminarUbicacion } from "../hooks/use-ubicacion-mutations";
import { DataTable, type Column } from "@/components/shared/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Can } from "@/components/shared/can";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { notifyError } from "@/shared/lib/toast";
import { UbicacionFormDialog } from "./ubicacion-form-dialog";
import type { Ubicacion } from "../types";

function EliminarUbicacionAction({ ubicacion }: { ubicacion: Ubicacion }) {
  const mutation = useEliminarUbicacion();
  return (
    <ConfirmDialog
      trigger={
        <Button variant="outline" size="sm">
          Eliminar
        </Button>
      }
      title="Eliminar ubicación"
      description={`¿Confirmás eliminar "${ubicacion.nombre}"? Se eliminan también todas sus ubicaciones hijas.`}
      confirmLabel="Eliminar"
      confirmVariant="destructive"
      isConfirming={mutation.isPending}
      onConfirm={() => mutation.mutate(ubicacion.id)}
    />
  );
}

export function UbicacionesList() {
  const ubicacionesQuery = useUbicaciones();
  const ubicaciones = ubicacionesQuery.data ?? [];

  const columns: Column<Ubicacion>[] = [
    { key: "nombre", header: "Nombre" },
    {
      key: "activo",
      header: "Estado",
      render: (row) => (row.activo ? <Badge variant="success">Activa</Badge> : <Badge variant="outline">Baja</Badge>),
    },
    {
      key: "id",
      header: "Acciones",
      render: (row) => (
        <Can permiso="catalogo:gestionar">
          <div className="flex items-center gap-2">
            <UbicacionFormDialog
              ubicacion={row}
              ubicaciones={ubicaciones}
              trigger={
                <Button variant="outline" size="sm">
                  Editar
                </Button>
              }
            />
            <EliminarUbicacionAction ubicacion={row} />
          </div>
        </Can>
      ),
    },
  ];

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Can permiso="catalogo:gestionar">
          <UbicacionFormDialog
            ubicaciones={ubicaciones}
            trigger={
              <Button size="sm">
                <Plus className="h-4 w-4" aria-hidden="true" />
                Nueva ubicación
              </Button>
            }
          />
        </Can>
      </div>
      <DataTable
        columns={columns}
        data={ubicaciones}
        getRowKey={(row) => row.id}
        isLoading={ubicacionesQuery.isLoading}
        error={ubicacionesQuery.isError ? "No se pudieron cargar las ubicaciones." : undefined}
        onRetry={() => ubicacionesQuery.refetch().catch(notifyError)}
        emptyTitle="Sin ubicaciones"
        emptyDescription="Creá la primera con «Nueva ubicación»."
      />
    </div>
  );
}
