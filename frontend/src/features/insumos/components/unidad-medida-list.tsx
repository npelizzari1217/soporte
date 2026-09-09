"use client";

/**
 * UnidadMedidaList — tabla del catálogo de unidades de medida (ABM, Admin >
 * Insumos). Activar/desactivar detrás de `ConfirmDialog` — dar de baja una
 * unidad no la elimina (el backend la protege con `RESTRICT` en el FK de
 * `insumos`), solo deja de ofrecerse para insumos nuevos. Mismo patrón que
 * `features/insumos/components/familia-insumo-list.tsx` /
 * `features/sectores/components/sector-list.tsx`.
 */
import { Plus } from "lucide-react";
import { useUnidadesMedida } from "../hooks/use-unidades-medida";
import { useCambiarEstadoActivoUnidadMedida } from "../hooks/use-unidad-medida-mutations";
import { DataTable, type Column } from "@/components/shared/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { notifyError } from "@/shared/lib/toast";
import { UnidadMedidaFormDialog } from "./unidad-medida-form-dialog";
import type { UnidadMedida } from "../types";

function EstadoActivoAction({ unidad }: { unidad: UnidadMedida }) {
  const mutation = useCambiarEstadoActivoUnidadMedida(unidad.id);
  return (
    <ConfirmDialog
      trigger={
        <Button variant="outline" size="sm">
          {unidad.activo ? "Dar de baja" : "Activar"}
        </Button>
      }
      title={unidad.activo ? "Dar de baja unidad de medida" : "Activar unidad de medida"}
      description={`¿Confirmás ${unidad.activo ? "dar de baja" : "activar"} "${unidad.nombre}"?`}
      confirmLabel={unidad.activo ? "Dar de baja" : "Activar"}
      confirmVariant={unidad.activo ? "destructive" : "default"}
      isConfirming={mutation.isPending}
      onConfirm={() => mutation.mutate({ activo: !unidad.activo })}
    />
  );
}

export function UnidadMedidaList() {
  const unidadesQuery = useUnidadesMedida();

  const columns: Column<UnidadMedida>[] = [
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
          <UnidadMedidaFormDialog
            unidad={row}
            trigger={
              <Button variant="outline" size="sm">
                Editar
              </Button>
            }
          />
          <EstadoActivoAction unidad={row} />
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <UnidadMedidaFormDialog
          trigger={
            <Button size="sm">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Nueva unidad
            </Button>
          }
        />
      </div>
      <DataTable
        columns={columns}
        data={unidadesQuery.data ?? []}
        getRowKey={(row) => row.id}
        isLoading={unidadesQuery.isLoading}
        error={unidadesQuery.isError ? "No se pudieron cargar las unidades de medida." : undefined}
        onRetry={() => unidadesQuery.refetch().catch(notifyError)}
        emptyTitle="Sin unidades de medida"
        emptyDescription="Creá la primera con el botón «Nueva unidad»."
      />
    </div>
  );
}
