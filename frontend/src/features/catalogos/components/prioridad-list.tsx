"use client";

/**
 * PrioridadList — tabla de prioridades (T4.1/T4.3). Mismo patrón que
 * `TipoTicketList`.
 */
import { Plus } from "lucide-react";
import { usePrioridades } from "@/features/tickets/hooks/use-catalogos";
import { DataTable, type Column } from "@/components/shared/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { notifyError } from "@/shared/lib/toast";
import { PrioridadFormDialog } from "./prioridad-form-dialog";
import { useCambiarEstadoActivoPrioridad } from "../hooks/use-catalogo-mutations";
import type { Prioridad } from "@/features/tickets/types";

function EstadoActivoAction({ prioridad }: { prioridad: Prioridad }) {
  const mutation = useCambiarEstadoActivoPrioridad(prioridad.id);
  return (
    <ConfirmDialog
      trigger={
        <Button variant="outline" size="sm">
          {prioridad.activo ? "Dar de baja" : "Activar"}
        </Button>
      }
      title={prioridad.activo ? "Dar de baja prioridad" : "Activar prioridad"}
      description={`¿Confirmás ${prioridad.activo ? "dar de baja" : "activar"} "${prioridad.nombre}"?`}
      confirmLabel={prioridad.activo ? "Dar de baja" : "Activar"}
      confirmVariant={prioridad.activo ? "destructive" : "default"}
      isConfirming={mutation.isPending}
      onConfirm={() => mutation.mutate({ activo: !prioridad.activo })}
    />
  );
}

export function PrioridadList() {
  const prioridadesQuery = usePrioridades();

  const columns: Column<Prioridad>[] = [
    { key: "codigo", header: "Código" },
    { key: "nombre", header: "Nombre" },
    { key: "orden", header: "Orden" },
    {
      key: "activo",
      header: "Estado",
      render: (row) => (row.activo ? <Badge variant="success">Activa</Badge> : <Badge variant="outline">Baja</Badge>),
    },
    {
      key: "id",
      header: "Acciones",
      render: (row) => (
        <div className="flex items-center gap-2">
          <PrioridadFormDialog
            prioridad={row}
            trigger={
              <Button variant="outline" size="sm">
                Editar
              </Button>
            }
          />
          <EstadoActivoAction prioridad={row} />
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <PrioridadFormDialog
          trigger={
            <Button size="sm">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Nueva prioridad
            </Button>
          }
        />
      </div>
      <DataTable
        columns={columns}
        data={prioridadesQuery.data ?? []}
        getRowKey={(row) => row.id}
        isLoading={prioridadesQuery.isLoading}
        error={prioridadesQuery.isError ? "No se pudieron cargar las prioridades." : undefined}
        onRetry={() => prioridadesQuery.refetch().catch(notifyError)}
        emptyTitle="Sin prioridades"
        emptyDescription="Creá la primera con el botón «Nueva prioridad»."
      />
    </div>
  );
}
