"use client";

/**
 * RespuestaPredefinidaList — tabla del catálogo de respuestas predefinidas (Admin > Catálogos).
 * Lista TODAS, también las desactivadas, para poder reactivarlas: se desactiva, no se borra.
 * Mismo patrón que `features/sectores/components/sector-list.tsx`.
 */
import { Plus } from "lucide-react";
import { useRespuestasPredefinidas } from "../hooks/use-respuestas-predefinidas";
import { useCambiarEstadoActivoRespuestaPredefinida } from "../hooks/use-respuesta-predefinida-mutations";
import { DataTable, type Column } from "@/components/shared/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { notifyError } from "@/shared/lib/toast";
import { RespuestaPredefinidaFormDialog } from "./respuesta-predefinida-form-dialog";
import type { RespuestaPredefinida } from "../types";

function EstadoActivoAction({ respuesta }: { respuesta: RespuestaPredefinida }) {
  const mutation = useCambiarEstadoActivoRespuestaPredefinida(respuesta.id);
  const accion = respuesta.activo ? "Desactivar" : "Activar";
  return (
    <ConfirmDialog
      trigger={
        <Button variant="outline" size="sm">
          {accion}
        </Button>
      }
      title={`${accion} respuesta`}
      description={`¿Confirmás ${accion.toLowerCase()} "${respuesta.titulo}"?${
        respuesta.activo ? " Deja de ofrecerse al comentar un ticket." : ""
      }`}
      confirmLabel={accion}
      confirmVariant={respuesta.activo ? "destructive" : "default"}
      isConfirming={mutation.isPending}
      onConfirm={() => mutation.mutate({ activo: !respuesta.activo })}
    />
  );
}

export function RespuestaPredefinidaList() {
  const respuestasQuery = useRespuestasPredefinidas();

  const columns: Column<RespuestaPredefinida>[] = [
    { key: "titulo", header: "Título" },
    {
      key: "texto",
      header: "Texto",
      render: (row) => <span className="line-clamp-2 whitespace-pre-line">{row.texto}</span>,
    },
    {
      key: "activo",
      header: "Estado",
      render: (row) =>
        row.activo ? <Badge variant="success">Activa</Badge> : <Badge variant="outline">Desactivada</Badge>,
    },
    {
      key: "id",
      header: "Acciones",
      render: (row) => (
        <div className="flex items-center gap-2">
          <RespuestaPredefinidaFormDialog
            respuesta={row}
            trigger={
              <Button variant="outline" size="sm">
                Editar
              </Button>
            }
          />
          <EstadoActivoAction respuesta={row} />
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <RespuestaPredefinidaFormDialog
          trigger={
            <Button size="sm">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Nueva respuesta
            </Button>
          }
        />
      </div>
      <DataTable
        columns={columns}
        data={respuestasQuery.data ?? []}
        getRowKey={(row) => row.id}
        isLoading={respuestasQuery.isLoading}
        error={respuestasQuery.isError ? "No se pudieron cargar las respuestas." : undefined}
        onRetry={() => respuestasQuery.refetch().catch(notifyError)}
        emptyTitle="Sin respuestas predefinidas"
        emptyDescription="Creá la primera con el botón «Nueva respuesta»."
      />
    </div>
  );
}
