"use client";

/**
 * FamiliaInsumoList — tabla del catálogo de familias de insumo (ABM, Admin >
 * Insumos). Activar/desactivar detrás de `ConfirmDialog` — dar de baja una
 * familia no la elimina (el backend la protege con `RESTRICT` en el FK de
 * `insumos`), solo deja de ofrecerse para insumos nuevos. Mismo patrón que
 * `features/sectores/components/sector-list.tsx`.
 */
import { Plus } from "lucide-react";
import { useFamiliasInsumo } from "../hooks/use-familias-insumo";
import { useCambiarEstadoActivoFamiliaInsumo } from "../hooks/use-familia-insumo-mutations";
import { DataTable, type Column } from "@/components/shared/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { notifyError } from "@/shared/lib/toast";
import { FamiliaInsumoFormDialog } from "./familia-insumo-form-dialog";
import type { FamiliaInsumo } from "../types";

function EstadoActivoAction({ familia }: { familia: FamiliaInsumo }) {
  const mutation = useCambiarEstadoActivoFamiliaInsumo(familia.id);
  return (
    <ConfirmDialog
      trigger={
        <Button variant="outline" size="sm">
          {familia.activo ? "Dar de baja" : "Activar"}
        </Button>
      }
      title={familia.activo ? "Dar de baja familia de insumo" : "Activar familia de insumo"}
      description={`¿Confirmás ${familia.activo ? "dar de baja" : "activar"} "${familia.nombre}"?`}
      confirmLabel={familia.activo ? "Dar de baja" : "Activar"}
      confirmVariant={familia.activo ? "destructive" : "default"}
      isConfirming={mutation.isPending}
      onConfirm={() => mutation.mutate({ activo: !familia.activo })}
    />
  );
}

export function FamiliaInsumoList() {
  const familiasQuery = useFamiliasInsumo();

  const columns: Column<FamiliaInsumo>[] = [
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
          <FamiliaInsumoFormDialog
            familia={row}
            trigger={
              <Button variant="outline" size="sm">
                Editar
              </Button>
            }
          />
          <EstadoActivoAction familia={row} />
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <FamiliaInsumoFormDialog
          trigger={
            <Button size="sm">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Nueva familia
            </Button>
          }
        />
      </div>
      <DataTable
        columns={columns}
        data={familiasQuery.data ?? []}
        getRowKey={(row) => row.id}
        isLoading={familiasQuery.isLoading}
        error={familiasQuery.isError ? "No se pudieron cargar las familias de insumo." : undefined}
        onRetry={() => familiasQuery.refetch().catch(notifyError)}
        emptyTitle="Sin familias de insumo"
        emptyDescription="Creá la primera con el botón «Nueva familia»."
      />
    </div>
  );
}
