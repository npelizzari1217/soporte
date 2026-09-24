"use client";

/**
 * FeriadosGlobalesAdminView — CONTAINER client component montado por
 * `/admin/feriados-globales` (sdd/feriados-configurables). Gate por
 * `isGlobalAdmin` — NUNCA por `permisos` (ROOT es ortogonal al rol/permisos
 * de una membresía, ADR-4), mismo criterio que `ClientesAdminView`,
 * `CiclosVigentesAdminView` y `TiposComponenteAdminView`.
 *
 * WU7a dejó la lista SOLO LECTURA; el commit anterior agregó crear/editar
 * (`FeriadoGlobalFormDialog`). Este commit cierra el ABM con la baja:
 * `ConfirmDialog` + `useEliminarFeriado`, mismo wiring que
 * `CiclosVigentesAdminView`'s `EliminarCicloVigenteAction`.
 */
import { Plus } from "lucide-react";
import { useSession } from "@/shared/hooks/use-session";
import { useFeriadosGlobales } from "../hooks/use-feriados-globales";
import { useEliminarFeriado } from "../hooks/use-feriados-globales-admin-mutations";
import { DataTable, type Column } from "@/components/shared/data-table";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { notifyError } from "@/shared/lib/toast";
import { formatearFechaCalendario } from "@/shared/lib/formato-fecha";
import { OrigenFeriadoBadge } from "./origen-feriado-badge";
import { FeriadoGlobalFormDialog } from "./feriado-global-form-dialog";
import type { Feriado } from "../types";

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
          <FeriadoGlobalFormDialog
            feriado={row}
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
          <FeriadoGlobalFormDialog
            trigger={
              <Button size="sm">
                <Plus className="h-4 w-4" aria-hidden="true" />
                Nuevo feriado
              </Button>
            }
          />
        }
      />
      <DataTable
        columns={columns}
        data={feriados}
        getRowKey={(row) => row.id}
        isLoading={feriadosQuery.isLoading}
        error={feriadosQuery.isError ? "No se pudieron cargar los feriados nacionales." : undefined}
        onRetry={() => feriadosQuery.refetch().catch(notifyError)}
        emptyTitle="Sin feriados nacionales"
        emptyDescription="Todavía no hay feriados nacionales cargados."
      />
    </div>
  );
}
