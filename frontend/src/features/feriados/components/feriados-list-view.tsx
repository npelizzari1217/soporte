"use client";

/**
 * FeriadosListView — CONTAINER client component montado por `/feriados`
 * (tasks 8.1/8.2, WU8a+WU8b, sdd/feriados-configurables; almanaque WU2,
 * sdd/feriados-almanaque). Lista COMBINADA: feriados nacionales
 * (`GET /feriados`) + propios del tenant (`GET /feriados-cliente`), merge
 * client-side (`combinarFeriados()`, D8).
 *
 * DOS vistas sobre la misma lista combinada, alternadas con un toggle —
 * decisión del dueño del repo: el ALMANAQUE es la vista por DEFECTO, la
 * tabla existente (WU8a/WU8b) queda intacta detrás del toggle "Ver como
 * lista". `AlmanaqueFeriados` (WU1) es puramente presentacional: esta
 * pantalla le inyecta `renderAcciones`, igual que ya hace con
 * `FeriadoFormDialog`/`EliminarFeriadoClienteAction` para la tabla.
 *
 * SIN gate de admin en la LECTURA (`spec.md`: cualquier autenticado del
 * tenant lee), en NINGUNA de las dos vistas. La ESCRITURA sí gatea por
 * `esAdminCliente`: columna Acciones (tabla), `renderAcciones` (almanaque) y
 * `onDiaLibre` (almanaque, WU2b) solo entonces, y en las tres un feriado
 * GLOBAL nunca lleva acciones — mismo criterio que `FeriadosGlobalesAdminContent`.
 *
 * Clickear un día LIBRE del almanaque (WU2b), solo para `esAdminCliente`,
 * abre el mismo `FeriadoFormDialog` de alta con la fecha clickeada precargada
 * (`fechaCreacion`, instancia controlada sin `trigger` propio — se abre vía
 * `onDiaLibre`). Para el resto de los roles el día libre sigue sin acción.
 */
import { useState, type ReactNode } from "react";
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
import { TableSkeleton } from "@/components/shared/skeletons";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Plus } from "lucide-react";
import { formatearFechaCalendario } from "@/shared/lib/formato-fecha";
import { notifyError } from "@/shared/lib/toast";
import { OrigenFeriadoBadge } from "./origen-feriado-badge";
import { FeriadoFormDialog, type FeriadoBasico } from "./feriado-form-dialog";
import { AlmanaqueFeriados } from "./almanaque-feriados";

// `Column.key` es `keyof T & string`; `acciones` es sintética (`render`
// override, no lee `row.acciones`) — mismo recurso de tipado local que
// `FeriadoColumnRow` en `feriados-globales-admin-view.tsx`.
type FilaColumnRow = FilaFeriadoCombinada & { acciones?: never };

type Vista = "almanaque" | "lista";

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
  const [vista, setVista] = useState<Vista>("almanaque");
  // `null` = diálogo de alta cerrado. Fecha `YYYY-MM-DD` del día libre
  // clickeado (nunca `new Date()` — mismo criterio que `combinarFeriados`,
  // la fecha de calendario ya viene armada del almanaque).
  const [fechaCreacion, setFechaCreacion] = useState<string | null>(null);

  const filas = combinarFeriados(globalesQuery.data ?? [], clienteQuery.data ?? []);
  const isLoading = globalesQuery.isLoading || clienteQuery.isLoading;
  const isError = globalesQuery.isError || clienteQuery.isError;

  function reintentar(): void {
    globalesQuery.refetch().catch(notifyError);
    clienteQuery.refetch().catch(notifyError);
  }

  // Mismas acciones que la columna "Acciones" de la tabla, reutilizando
  // EXACTAMENTE el mismo diálogo de edición y confirmación de borrado — solo
  // se llama cuando `esAdminCliente` (ver el `renderAcciones` pasado abajo).
  function renderAccionesAlmanaque(row: FilaFeriadoCombinada): ReactNode {
    if (row.origen !== "CLIENTE") return null;
    return (
      <>
        <FeriadoFormDialog
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
      </>
    );
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
                  <FeriadoFormDialog
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
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setVista((actual) => (actual === "almanaque" ? "lista" : "almanaque"))}
            >
              {vista === "almanaque" ? "Ver como lista" : "Ver como almanaque"}
            </Button>
            {esAdminCliente ? (
              <FeriadoFormDialog
                useCrearMutation={useCrearFeriadoCliente}
                useEditarMutation={useEditarFeriadoCliente}
                trigger={
                  <Button size="sm">
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Nuevo feriado
                  </Button>
                }
              />
            ) : undefined}
          </div>
        }
      />
      {esAdminCliente ? (
        <FeriadoFormDialog
          useCrearMutation={useCrearFeriadoCliente}
          useEditarMutation={useEditarFeriadoCliente}
          fechaInicial={fechaCreacion ?? undefined}
          open={fechaCreacion !== null}
          onOpenChange={(next) => {
            if (!next) setFechaCreacion(null);
          }}
        />
      ) : null}
      {isLoading ? (
        <TableSkeleton rows={5} columns={columnas.length} />
      ) : isError ? (
        <ErrorState message="No se pudieron cargar los feriados." onRetry={reintentar} />
      ) : vista === "almanaque" ? (
        <AlmanaqueFeriados
          feriados={filas}
          renderAcciones={esAdminCliente ? renderAccionesAlmanaque : undefined}
          onDiaLibre={esAdminCliente ? setFechaCreacion : undefined}
        />
      ) : (
        <DataTable
          columns={columnas}
          data={filas}
          getRowKey={(row) => row.id}
          emptyTitle="Sin feriados"
          emptyDescription="Todavía no hay feriados cargados."
        />
      )}
    </div>
  );
}
