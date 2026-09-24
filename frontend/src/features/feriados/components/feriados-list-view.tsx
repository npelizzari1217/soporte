"use client";

/**
 * FeriadosListView — CONTAINER client component montado por `/feriados`
 * (tasks 8.1/8.2, WU8a+WU8b, sdd/feriados-configurables). Lista COMBINADA:
 * feriados nacionales (`GET /feriados`) + propios del tenant
 * (`GET /feriados-cliente`), merge client-side (`combinarFeriados()`, D8).
 *
 * SIN gate de admin en la LECTURA (`spec.md`: cualquier autenticado del
 * tenant lee). La ESCRITURA (WU8b) sí gatea por `esAdminCliente`: agrega la
 * columna Acciones solo entonces, y dentro `render` devuelve `null` para
 * filas GLOBAL — nunca editables/eliminables acá, mismo criterio que
 * `FeriadosGlobalesAdminContent`. Reutiliza `FeriadoGlobalFormDialog` (WU7b,
 * generalizado en este commit) con los hooks de
 * `use-feriados-cliente-admin-mutations.ts`, sin duplicar el diálogo.
 */
import { useSession } from "@/shared/hooks/use-session";
import { useFeriadosGlobales } from "../hooks/use-feriados-globales";
import { useFeriadosCliente } from "../hooks/use-feriados-cliente";
import {
  useCrearFeriadoCliente,
  useEditarFeriadoCliente,
  useEliminarFeriadoCliente,
} from "../hooks/use-feriados-cliente-admin-mutations";
import { combinarFeriados, type FilaFeriadoCombinada } from "../combinar-feriados";
import { DataTable, type Column } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Plus } from "lucide-react";
import { formatearFechaCalendario } from "@/shared/lib/formato-fecha";
import { notifyError } from "@/shared/lib/toast";
import { OrigenFeriadoBadge } from "./origen-feriado-badge";
import { FeriadoGlobalFormDialog, type FeriadoBasico } from "./feriado-global-form-dialog";

// `Column.key` es `keyof T & string`; `acciones` es sintética (`render`
// override, no lee `row.acciones`) — mismo recurso de tipado local que
// `FeriadoColumnRow` en `feriados-globales-admin-view.tsx`.
type FilaColumnRow = FilaFeriadoCombinada & { acciones?: never };

function EliminarFeriadoClienteAction({ feriado }: { feriado: FeriadoBasico }) {
  const mutation = useEliminarFeriadoCliente();
  return (
    <ConfirmDialog
      trigger={
        <Button variant="outline" size="sm">
          Eliminar
        </Button>
      }
      title="Eliminar feriado"
      description={`¿Confirmás eliminar "${feriado.descripcion}" (${formatearFechaCalendario(feriado.fecha)})? Esta acción no se puede deshacer.`}
      confirmLabel="Eliminar"
      confirmVariant="destructive"
      isConfirming={mutation.isPending}
      onConfirm={() => mutation.mutate(feriado.id)}
    />
  );
}

export function FeriadosListView() {
  const { esAdminCliente } = useSession();
  const globalesQuery = useFeriadosGlobales();
  const clienteQuery = useFeriadosCliente();

  const filas = combinarFeriados(globalesQuery.data ?? [], clienteQuery.data ?? []);
  const isLoading = globalesQuery.isLoading || clienteQuery.isLoading;
  const isError = globalesQuery.isError || clienteQuery.isError;

  function reintentar(): void {
    globalesQuery.refetch().catch(notifyError);
    clienteQuery.refetch().catch(notifyError);
  }

  const columnas: Column<FilaColumnRow>[] = [
    // Feriado.fecha / FeriadoCliente.fecha son @db.Date — fecha de calendario.
    { key: "fecha", header: "Fecha", render: (row) => formatearFechaCalendario(row.fecha) },
    { key: "descripcion", header: "Descripción" },
    { key: "origen", header: "Origen", render: (row) => <OrigenFeriadoBadge origen={row.origen} /> },
    ...(esAdminCliente
      ? [
          {
            key: "acciones" as const,
            header: "Acciones",
            render: (row: FilaColumnRow) =>
              row.origen === "CLIENTE" ? (
                <div className="flex items-center gap-2">
                  <FeriadoGlobalFormDialog
                    feriado={row}
                    useCrearMutation={useCrearFeriadoCliente}
                    useEditarMutation={useEditarFeriadoCliente}
                    trigger={
                      <Button variant="outline" size="sm">
                        Editar
                      </Button>
                    }
                  />
                  <EliminarFeriadoClienteAction feriado={row} />
                </div>
              ) : null,
          },
        ]
      : []),
  ];

  return (
    <div>
      <PageHeader
        title="Feriados"
        description="Feriados nacionales y del cliente que aplican al cálculo de vencimientos SLA hábiles."
        actions={
          esAdminCliente ? (
            <FeriadoGlobalFormDialog
              useCrearMutation={useCrearFeriadoCliente}
              useEditarMutation={useEditarFeriadoCliente}
              trigger={
                <Button size="sm">
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Nuevo feriado
                </Button>
              }
            />
          ) : undefined
        }
      />
      <DataTable
        columns={columnas}
        data={filas}
        getRowKey={(row) => row.id}
        isLoading={isLoading}
        error={isError ? "No se pudieron cargar los feriados." : undefined}
        onRetry={reintentar}
        emptyTitle="Sin feriados"
        emptyDescription="Todavía no hay feriados cargados."
      />
    </div>
  );
}
