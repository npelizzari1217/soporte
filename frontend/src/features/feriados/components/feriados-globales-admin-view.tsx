"use client";

/**
 * FeriadosGlobalesAdminView — CONTAINER client component montado por
 * `/admin/feriados-globales` (sdd/feriados-configurables, WU7a). Gate por
 * `isGlobalAdmin` — NUNCA por `permisos` (ROOT es ortogonal al rol/permisos
 * de una membresía, ADR-4), mismo criterio que `ClientesAdminView`,
 * `CiclosVigentesAdminView` y `TiposComponenteAdminView`.
 *
 * WU7a es SOLO LECTURA: lista de feriados nacionales ordenada por fecha,
 * cada fila con `OrigenFeriadoBadge`. Sin acciones de crear/editar/eliminar
 * todavía — WU7b agrega los diálogos y las mutaciones (task 7.1, apply-progress).
 */
import { useSession } from "@/shared/hooks/use-session";
import { useFeriadosGlobales } from "../hooks/use-feriados-globales";
import { DataTable, type Column } from "@/components/shared/data-table";
import { ErrorState } from "@/components/shared/error-state";
import { PageHeader } from "@/components/shared/page-header";
import { notifyError } from "@/shared/lib/toast";
import { formatearFechaCalendario } from "@/shared/lib/formato-fecha";
import { OrigenFeriadoBadge } from "./origen-feriado-badge";
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

function FeriadosGlobalesAdminContent() {
  const feriadosQuery = useFeriadosGlobales();
  const feriados = feriadosQuery.data ?? [];

  const columns: Column<Feriado>[] = [
    // Feriado.fecha es @db.Date — fecha de calendario.
    { key: "fecha", header: "Fecha", render: (row) => formatearFechaCalendario(row.fecha) },
    { key: "descripcion", header: "Descripción" },
    {
      key: "id",
      header: "Origen",
      render: () => <OrigenFeriadoBadge origen="GLOBAL" />,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Feriados nacionales"
        description="Lista maestra de feriados nacionales (solo ROOT). Se usan en el cálculo de vencimientos SLA hábiles de todos los clientes."
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
