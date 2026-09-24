"use client";

/**
 * FeriadosListView — CONTAINER client component montado por `/feriados`
 * (task 8.1, WU8a, sdd/feriados-configurables). Lista COMBINADA de feriados
 * nacionales (`GET /feriados`) y propios del tenant (`GET /feriados-cliente`),
 * mergeados client-side con `combinarFeriados()` (D8, design.md) y ordenados
 * por fecha.
 *
 * SIN gate de admin — a diferencia de `CatalogosAdminView`/
 * `FeriadosGlobalesAdminView`. `spec.md` ("Per-client admin manages its own
 * holidays; other roles read") exige que CUALQUIER actor autenticado del
 * tenant pueda LEER esta lista; solo la escritura (WU8b) se gatea por
 * `esAdminCliente`. Misma identidad de "lectura abierta a cualquier
 * autenticado" que `useModelosEquipo` (`use-modelos-equipo.ts`).
 *
 * Solo lectura en esta pasada: sin columna Acciones. WU8b agrega crear/
 * editar/eliminar, gateado por `esAdminCliente`, únicamente sobre las filas
 * CLIENTE — las GLOBAL nunca son editables acá, mismo criterio que
 * `FeriadosGlobalesAdminContent` con las filas de `/admin/feriados-globales`.
 */
import { useFeriadosGlobales } from "../hooks/use-feriados-globales";
import { useFeriadosCliente } from "../hooks/use-feriados-cliente";
import { combinarFeriados, type FilaFeriadoCombinada } from "../combinar-feriados";
import { DataTable, type Column } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { formatearFechaCalendario } from "@/shared/lib/formato-fecha";
import { notifyError } from "@/shared/lib/toast";
import { OrigenFeriadoBadge } from "./origen-feriado-badge";

const COLUMNAS: Column<FilaFeriadoCombinada>[] = [
  // Feriado.fecha / FeriadoCliente.fecha son @db.Date — fecha de calendario.
  { key: "fecha", header: "Fecha", render: (row) => formatearFechaCalendario(row.fecha) },
  { key: "descripcion", header: "Descripción" },
  { key: "origen", header: "Origen", render: (row) => <OrigenFeriadoBadge origen={row.origen} /> },
];

export function FeriadosListView() {
  const globalesQuery = useFeriadosGlobales();
  const clienteQuery = useFeriadosCliente();

  const filas = combinarFeriados(globalesQuery.data ?? [], clienteQuery.data ?? []);
  const isLoading = globalesQuery.isLoading || clienteQuery.isLoading;
  const isError = globalesQuery.isError || clienteQuery.isError;

  function reintentar(): void {
    globalesQuery.refetch().catch(notifyError);
    clienteQuery.refetch().catch(notifyError);
  }

  return (
    <div>
      <PageHeader
        title="Feriados"
        description="Feriados nacionales y del cliente que aplican al cálculo de vencimientos SLA hábiles."
      />
      <DataTable
        columns={COLUMNAS}
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
