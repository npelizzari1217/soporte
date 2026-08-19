"use client";

/**
 * TicketsListView — CONTAINER client component montado por `/tickets`
 * (ADR-1: la page es un Server Component fino). Filtros viven en la URL
 * (searchParams, ADR-2) — deep-link + back/forward funcionan sin estado
 * cliente duplicado.
 *
 * Deviación de scope (documentada, no bloqueante): la spec R-M1 pide filtro
 * de rango de fechas (popover). B1 implementa estado/tipo/prioridad/
 * asignado/búsqueda — el rango de fechas queda pendiente para un batch
 * posterior (el tipo `TicketsFiltros`/hook `useTickets` ya soportan
 * `fechaDesde`/`fechaHasta`, falta solo el control de UI).
 */
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { useTickets } from "../hooks/use-tickets";
import { useUrlFilters } from "@/shared/hooks/use-url-filters";
import { useTiposTicket, usePrioridades, useEstados } from "../hooks/use-catalogos";
import { useUsuariosAsignables } from "../hooks/use-usuarios-asignables";
import { buildIdToCodigoMap } from "../lib/catalog-map";
import { DataTable, type Column } from "@/components/shared/data-table";
import { FilterBar } from "@/components/shared/filter-bar";
import { Pagination } from "@/components/shared/pagination";
import { PageHeader } from "@/components/shared/page-header";
import { Can } from "@/components/shared/can";
import { Select } from "@/components/ui/select";
import { TicketCreateDialog } from "./ticket-create-dialog";
import { ExportarTicketsButton } from "./exportar-tickets-button";
import { StatusBadge, type TicketEstado } from "@/components/ui/status-badge";
import { PriorityBadge } from "@/components/ui/priority-badge";
import { notifyError } from "@/shared/lib/toast";
import type { Ticket, TicketsFiltros } from "../types";

const PAGE_SIZE = 10;

export function TicketsListView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { updateFiltros, irAPagina, limpiarFiltros } = useUrlFilters<TicketsFiltros>("pagina");

  const filtros: TicketsFiltros = useMemo(
    () => ({
      estado: searchParams.get("estado") ?? undefined,
      tipo: searchParams.get("tipo") ?? undefined,
      prioridad: searchParams.get("prioridad") ?? undefined,
      asignado: searchParams.get("asignado") ?? undefined,
      busqueda: searchParams.get("busqueda") ?? undefined,
      pagina: Number(searchParams.get("pagina") ?? "1"),
      porPagina: PAGE_SIZE,
    }),
    [searchParams],
  );

  /**
   * La PÁGINA cuenta como filtro cuando es mayor a 1: con pocas filas, una
   * `pagina` vieja pegada en la URL deja el listado vacío para siempre, y ese
   * vacío se leía como "los datos no cargaron" (ver `DataTable.hayFiltrosActivos`).
   */
  const hayFiltrosActivos =
    Boolean(filtros.estado) ||
    Boolean(filtros.tipo) ||
    Boolean(filtros.prioridad) ||
    Boolean(filtros.asignado) ||
    Boolean(filtros.busqueda) ||
    (filtros.pagina ?? 1) > 1;

  const ticketsQuery = useTickets(filtros);
  const tiposQuery = useTiposTicket();
  const prioridadesQuery = usePrioridades();
  const estadosQuery = useEstados();
  const usuariosQuery = useUsuariosAsignables();

  const prioridadCodigoMap = useMemo(
    () => buildIdToCodigoMap(prioridadesQuery.data ?? []),
    [prioridadesQuery.data],
  );
  const estadoCodigoMap = useMemo(() => buildIdToCodigoMap(estadosQuery.data ?? []), [estadosQuery.data]);

  const columns: Column<Ticket>[] = [
    { key: "numero", header: "Número" },
    { key: "titulo", header: "Título" },
    {
      key: "estadoId",
      header: "Estado",
      render: (row) => <StatusBadge estado={(estadoCodigoMap.get(row.estadoId) as TicketEstado) ?? "NUEVO"} />,
    },
    {
      key: "prioridadId",
      header: "Prioridad",
      render: (row) => <PriorityBadge prioridad={prioridadCodigoMap.get(row.prioridadId) ?? "-"} />,
    },
    {
      key: "asignadoId",
      header: "Técnico asignado",
      // El backend resuelve batch cross-DB `asignadoNombre`/`asignadoApellido`
      // (puede ser null si el ticket no tiene asignado o si el usuario fue
      // removido del tenant); en ambos casos mostramos "Sin asignar".
      render: (row) =>
        row.asignadoId && row.asignadoNombre ? (
          `${row.asignadoNombre} ${row.asignadoApellido ?? ""}`.trim()
        ) : (
          <span className="text-muted-foreground">Sin asignar</span>
        ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Tickets"
        actions={
          <>
            {/*
              Recibe el MISMO objeto `filtros` que alimenta `useTickets`: es lo
              que garantiza que el CSV y la pantalla cuenten lo mismo.
            */}
            <ExportarTicketsButton filtros={filtros} />
            <Can permiso="TICKETS:ALTAS">
              <TicketCreateDialog />
            </Can>
          </>
        }
      />

      <FilterBar
        searchPlaceholder="Buscar por título o descripción…"
        searchValue={filtros.busqueda ?? ""}
        onSearchChange={(value) => updateFiltros({ busqueda: value })}
      >
        <div className="flex flex-col gap-1">
          <label htmlFor="filtro-estado" className="sr-only">
            Estado
          </label>
          <Select
            id="filtro-estado"
            value={filtros.estado ?? ""}
            onChange={(e) => updateFiltros({ estado: e.target.value || undefined })}
          >
            <option value="">Todos los estados</option>
            {(estadosQuery.data ?? []).map((estado) => (
              <option key={estado.id} value={estado.id}>
                {estado.nombre}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="filtro-tipo" className="sr-only">
            Tipo
          </label>
          <Select
            id="filtro-tipo"
            value={filtros.tipo ?? ""}
            onChange={(e) => updateFiltros({ tipo: e.target.value || undefined })}
          >
            <option value="">Todos los tipos</option>
            {(tiposQuery.data ?? []).map((tipo) => (
              <option key={tipo.id} value={tipo.id}>
                {tipo.nombre}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="filtro-prioridad" className="sr-only">
            Prioridad
          </label>
          <Select
            id="filtro-prioridad"
            value={filtros.prioridad ?? ""}
            onChange={(e) => updateFiltros({ prioridad: e.target.value || undefined })}
          >
            <option value="">Todas las prioridades</option>
            {(prioridadesQuery.data ?? []).map((prioridad) => (
              <option key={prioridad.id} value={prioridad.id}>
                {prioridad.nombre}
              </option>
            ))}
          </Select>
        </div>

        <Can permiso="TICKETS:VER_TODOS">
          <div className="flex flex-col gap-1">
            <label htmlFor="filtro-asignado" className="sr-only">
              Asignado
            </label>
            <Select
              id="filtro-asignado"
              value={filtros.asignado ?? ""}
              onChange={(e) => updateFiltros({ asignado: e.target.value || undefined })}
            >
              <option value="">Cualquier asignado</option>
              {(usuariosQuery.data ?? []).map((usuario) => (
                <option key={usuario.id} value={usuario.id}>
                  {usuario.nombre} {usuario.apellido}
                </option>
              ))}
            </Select>
          </div>
        </Can>
      </FilterBar>

      <div className="mt-4">
        <DataTable
          columns={columns}
          data={ticketsQuery.data?.items ?? []}
          getRowKey={(row) => row.id}
          isLoading={ticketsQuery.isLoading}
          error={ticketsQuery.isError ? "No se pudieron cargar los tickets." : undefined}
          onRetry={() => ticketsQuery.refetch().catch(notifyError)}
          onRowClick={(row) => router.push(`/tickets/${row.id}`)}
          emptyTitle="Sin tickets"
          emptyDescription="Todavía no hay tickets registrados."
          hayFiltrosActivos={hayFiltrosActivos}
          onLimpiarFiltros={limpiarFiltros}
        />
      </div>

      {ticketsQuery.data && (
        <Pagination
          page={ticketsQuery.data.pagina}
          pageSize={ticketsQuery.data.porPagina}
          total={ticketsQuery.data.total}
          onPageChange={irAPagina}
        />
      )}
    </div>
  );
}
