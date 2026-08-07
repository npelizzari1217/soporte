"use client";

/**
 * TipoTicketList — tabla de tipos de ticket (T4.1/T4.2). Activar/desactivar
 * detrás de `ConfirmDialog` (mismo primitivo que KB, B3) — dar de baja un
 * tipo no rompe tickets existentes (ver backend), pero sigue siendo una
 * acción con efecto visible en toda la app (deja de aparecer en selects).
 */
import { Plus } from "lucide-react";
import { useTiposTicket } from "@/features/tickets/hooks/use-catalogos";
import { DataTable, type Column } from "@/components/shared/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { notifyError } from "@/shared/lib/toast";
import { TipoTicketFormDialog } from "./tipo-ticket-form-dialog";
import { useCambiarEstadoActivoTipoTicket } from "../hooks/use-catalogo-mutations";
import type { TipoTicket } from "@/features/tickets/types";

function EstadoActivoAction({ tipo }: { tipo: TipoTicket }) {
  const mutation = useCambiarEstadoActivoTipoTicket(tipo.id);
  return (
    <ConfirmDialog
      trigger={
        <Button variant="outline" size="sm">
          {tipo.activo ? "Dar de baja" : "Activar"}
        </Button>
      }
      title={tipo.activo ? "Dar de baja tipo de ticket" : "Activar tipo de ticket"}
      description={`¿Confirmás ${tipo.activo ? "dar de baja" : "activar"} "${tipo.nombre}"?`}
      confirmLabel={tipo.activo ? "Dar de baja" : "Activar"}
      confirmVariant={tipo.activo ? "destructive" : "default"}
      isConfirming={mutation.isPending}
      onConfirm={() => mutation.mutate({ activo: !tipo.activo })}
    />
  );
}

export function TipoTicketList() {
  const tiposQuery = useTiposTicket();

  const columns: Column<TipoTicket>[] = [
    { key: "codigo", header: "Código" },
    { key: "nombre", header: "Nombre" },
    {
      key: "activo",
      header: "Estado",
      render: (row) => (row.activo ? <Badge variant="success">Activo</Badge> : <Badge variant="outline">Baja</Badge>),
    },
    {
      key: "id",
      header: "Acciones",
      render: (row) => (
        <div className="flex items-center gap-2">
          <TipoTicketFormDialog
            tipo={row}
            trigger={
              <Button variant="outline" size="sm">
                Editar
              </Button>
            }
          />
          <EstadoActivoAction tipo={row} />
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <TipoTicketFormDialog
          trigger={
            <Button size="sm">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Nuevo tipo
            </Button>
          }
        />
      </div>
      <DataTable
        columns={columns}
        data={tiposQuery.data ?? []}
        getRowKey={(row) => row.id}
        isLoading={tiposQuery.isLoading}
        error={tiposQuery.isError ? "No se pudieron cargar los tipos de ticket." : undefined}
        onRetry={() => tiposQuery.refetch().catch(notifyError)}
        emptyTitle="Sin tipos de ticket"
        emptyDescription="Creá el primero con el botón «Nuevo tipo»."
      />
    </div>
  );
}
