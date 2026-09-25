"use client";

/**
 * FeriadosGlobalesAdminView — CONTAINER client component montado por
 * `/admin/feriados-globales` (sdd/feriados-configurables). Gate por
 * `isGlobalAdmin` — NUNCA por `permisos` (ROOT es ortogonal al rol/permisos
 * de una membresía, ADR-4), mismo criterio que `ClientesAdminView`,
 * `CiclosVigentesAdminView` y `TiposComponenteAdminView`.
 *
 * WU7a dejó la lista SOLO LECTURA; un commit posterior agregó crear/editar
 * (`FeriadoFormDialog`) y otro cerró el ABM con la baja (`ConfirmDialog` +
 * `useEliminarFeriado`, mismo wiring que `CiclosVigentesAdminView`'s
 * `EliminarCicloVigenteAction`).
 *
 * WU3 (sdd/feriados-almanaque) agrega el ALMANAQUE como vista por defecto,
 * espejo del toggle de `FeriadosListView`: acá TODAS las filas son GLOBAL
 * (ROOT es el único usuario de esta pantalla, ya gateada por
 * `isGlobalAdmin`), así que Editar/Eliminar se muestran para cualquier
 * feriado seleccionado del panel, sin el filtro por origen que sí necesita
 * la pantalla de cliente. Clickear un día libre abre el mismo
 * `FeriadoFormDialog` de alta con la fecha precargada (`fechaCreacion`,
 * instancia controlada sin `trigger` propio), igual que `FeriadosListView`.
 */
import { useState, type ReactNode } from "react";
import { Plus } from "lucide-react";
import { useSession } from "@/shared/hooks/use-session";
import { useFeriadosGlobales } from "../hooks/use-feriados-globales";
import {
  useCrearFeriado,
  useEditarFeriado,
  useEliminarFeriado,
} from "../hooks/use-feriados-globales-admin-mutations";
import { DataTable, type Column } from "@/components/shared/data-table";
import { TableSkeleton } from "@/components/shared/skeletons";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { notifyError } from "@/shared/lib/toast";
import { formatearFechaCalendario } from "@/shared/lib/formato-fecha";
import { OrigenFeriadoBadge } from "./origen-feriado-badge";
import { FeriadoFormDialog } from "./feriado-form-dialog";
import { AlmanaqueFeriados, type FeriadoAlmanaqueRow } from "./almanaque-feriados";
import type { Feriado } from "../types";

type Vista = "almanaque" | "lista";

export function FeriadosGlobalesAdminView() {
  const { isGlobalAdmin } = useSession();

  return (
    <div>
      {isGlobalAdmin ? (
        <FeriadosGlobalesAdminContent />
      ) : (
        <ErrorState message="Solo ROOT puede administrar los feriados nacionales." />
      )}
    </div>
  );
}

// `Column.key` es `keyof T & string`; `Feriado` solo tiene 3 campos reales
// pero hacen falta 4 columnas (Origen/Acciones son sintéticas). Extensión de
// tipado local, sin tocar `Feriado` — razón completa en apply-progress.md.
type FeriadoColumnRow = Feriado & { origen?: never; acciones?: never };

function EliminarFeriadoAction({ feriado }: { feriado: Feriado }) {
  const mutation = useEliminarFeriado();
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

function FeriadosGlobalesAdminContent() {
  const feriadosQuery = useFeriadosGlobales();
  const feriados = feriadosQuery.data ?? [];
  const [vista, setVista] = useState<Vista>("almanaque");
  // `null` = diálogo de alta cerrado. Fecha `YYYY-MM-DD` del día libre
  // clickeado (nunca `new Date()` — la fecha de calendario ya viene armada
  // del almanaque, mismo criterio que `FeriadosListView`).
  const [fechaCreacion, setFechaCreacion] = useState<string | null>(null);

  // Sin `new Date()`: el origen se asigna por asignación de campo, no por
  // reconstrucción de la fecha (mismo criterio que `combinarFeriados`).
  const filasAlmanaque: FeriadoAlmanaqueRow[] = feriados.map((feriado) => ({
    ...feriado,
    origen: "GLOBAL" as const,
  }));

  // Todas las filas son GLOBAL acá — ROOT es el único usuario de esta
  // pantalla, sin el filtro por origen que sí necesita `FeriadosListView`.
  function renderAccionesAlmanaque(row: FeriadoAlmanaqueRow): ReactNode {
    return (
      <>
        <FeriadoFormDialog
          feriado={row}
          useCrearMutation={useCrearFeriado}
          useEditarMutation={useEditarFeriado}
          trigger={
            <Button variant="outline" size="sm">
              Editar
            </Button>
          }
        />
        <EliminarFeriadoAction feriado={row} />
      </>
    );
  }

  const columns: Column<FeriadoColumnRow>[] = [
    // Feriado.fecha es @db.Date — fecha de calendario.
    { key: "fecha", header: "Fecha", render: (row) => formatearFechaCalendario(row.fecha) },
    { key: "descripcion", header: "Descripción" },
    {
      key: "origen",
      header: "Origen",
      render: () => <OrigenFeriadoBadge origen="GLOBAL" />,
    },
    {
      key: "acciones",
      header: "Acciones",
      render: (row) => (
        <div className="flex items-center gap-2">
          <FeriadoFormDialog
            feriado={row}
            useCrearMutation={useCrearFeriado}
            useEditarMutation={useEditarFeriado}
            trigger={
              <Button variant="outline" size="sm">
                Editar
              </Button>
            }
          />
          <EliminarFeriadoAction feriado={row} />
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Feriados nacionales"
        description="Lista maestra de feriados nacionales (solo ROOT). Se usan en el cálculo de vencimientos SLA hábiles de todos los clientes."
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
            <FeriadoFormDialog
              useCrearMutation={useCrearFeriado}
              useEditarMutation={useEditarFeriado}
              trigger={
                <Button size="sm">
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Nuevo feriado
                </Button>
              }
            />
          </div>
        }
      />
      <FeriadoFormDialog
        useCrearMutation={useCrearFeriado}
        useEditarMutation={useEditarFeriado}
        fechaInicial={fechaCreacion ?? undefined}
        open={fechaCreacion !== null}
        onOpenChange={(next) => {
          if (!next) setFechaCreacion(null);
        }}
      />
      {feriadosQuery.isLoading ? (
        <TableSkeleton rows={5} columns={columns.length} />
      ) : feriadosQuery.isError ? (
        <ErrorState
          message="No se pudieron cargar los feriados nacionales."
          onRetry={() => feriadosQuery.refetch().catch(notifyError)}
        />
      ) : vista === "almanaque" ? (
        <AlmanaqueFeriados feriados={filasAlmanaque} renderAcciones={renderAccionesAlmanaque} onDiaLibre={setFechaCreacion} />
      ) : (
        <DataTable
          columns={columns}
          data={feriados}
          getRowKey={(row) => row.id}
          emptyTitle="Sin feriados nacionales"
          emptyDescription="Todavía no hay feriados nacionales cargados."
        />
      )}
    </div>
  );
}
