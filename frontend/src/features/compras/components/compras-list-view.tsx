"use client";

/**
 * ComprasListView — CONTAINER montado por `/compras` (PR-24,
 * sdd/redisenio-modulo-compras). Reemplaza el placeholder "Módulo en
 * reconstrucción" de PR-1 con el listado real sobre el dominio nuevo
 * (`Compra`/`ItemCompra`/`OperacionCompra`).
 *
 * RBAC (decisión del maintainer, `sdd/redisenio-modulo-compras/rbac-consultas`,
 * 2026-08-14): la lectura del listado se gatea SOLO por módulo (`COMPRAS`,
 * resuelto aguas arriba por el guard de navegación/layout) — CUALQUIER rol
 * con el módulo habilitado ve todas las compras del tenant. A diferencia de
 * `EquiposListView` (`<Can permiso="EQUIPOS:LECTURA">`, WU-7.6), acá NO hay
 * gate de permiso envolviendo la tabla: `ComprasController.listar()` no
 * declara `@RequiereAcciones`, así que un `<Can>` acá sería una restricción de UI
 * sin respaldo del backend.
 *
 * Alta de compra: `CompraCreateDialog` (cierra el hueco del checklist
 * documentado en `sdd/redisenio-modulo-compras/hueco-compra-create-dialog`
 * — ningún PR de la Fase F lo había asignado), gateada por `COMPRAS:ALTAS`
 * vía `<Can>` (mismo criterio que el resto de los triggers de escritura del
 * repo — `TicketsListView`, `EquipoDetailView`). Esta SÍ es una acción de
 * escritura (a diferencia de la lectura del resto de la vista), por eso es
 * la única parte de este archivo detrás de un gate de permiso.
 *
 * Paginación: SIEMPRE server-side vía `total` real de `ListarComprasResponse`
 * (S32/S33 — `PrismaCompraRepository` cuenta con un `count()` dedicado,
 * commit `b6c3552`). NUNCA se deriva de `items.length` (requisito duro).
 *
 * WU-30 (`compras-tres-etapas-y-sectores` R7/R11): `GET /compras` ahora
 * acepta 5 filtros de negocio además de la paginación — `cicloId`,
 * `soloEnCurso`, `sectorId`, `fechaDesde`, `fechaHasta`. Filtros viven en la
 * URL (searchParams, mismo criterio ADR-2 que `TicketsListView`) — deep-link
 * + back/forward funcionan sin estado cliente duplicado. `cicloId` queda
 * FUERA de este `FilterBar` a propósito: no hay selector de ciclo en el
 * frontend hoy (siempre filtra sobre el vigente, resuelto server-side).
 *
 * S33 — el listado NUNCA trae `items`: las columnas SOLO muestran
 * derivados de cabecera ya resueltos por el backend (`estado`/`comprado`/
 * `cerrado`/`totalesPorMoneda`, ADR-C1). CERO `if`/`.every()`/`.filter()`
 * sobre ítems en este archivo — si hiciera falta, la regla pertenece al
 * backend.
 */
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { useCompras } from "../hooks/use-compras";
import { useSectores } from "@/features/sectores/hooks/use-sectores";
import { DataTable, type Column } from "@/components/shared/data-table";
import { FilterBar } from "@/components/shared/filter-bar";
import { Pagination } from "@/components/shared/pagination";
import { PageHeader } from "@/components/shared/page-header";
import { Can } from "@/components/shared/can";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { notifyError } from "@/shared/lib/toast";
import { EstadoCompraBadge } from "./estado-compra-badge";
import { CompraCreateDialog } from "./compra-create-dialog";
import { formatearTotalesPorMoneda } from "../lib/formatear-totales";
import type { CompraListItem, ComprasFiltros } from "../types";

const PAGE_SIZE = 10;

export function ComprasListView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filtros: ComprasFiltros = useMemo(
    () => ({
      pagina: Number(searchParams.get("pagina") ?? "1"),
      porPagina: PAGE_SIZE,
      soloEnCurso: searchParams.has("soloEnCurso") ? searchParams.get("soloEnCurso") === "true" : undefined,
      sectorId: searchParams.get("sectorId") ?? undefined,
      fechaDesde: searchParams.get("fechaDesde") ?? undefined,
      fechaHasta: searchParams.get("fechaHasta") ?? undefined,
    }),
    [searchParams],
  );

  function updateFiltros(patch: Partial<ComprasFiltros>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined || value === "") next.delete(key);
      else next.set(key, String(value));
    }
    next.set("pagina", "1");
    router.replace(`${pathname}?${next.toString()}`);
  }

  function irAPagina(pagina: number) {
    const next = new URLSearchParams(searchParams.toString());
    next.set("pagina", String(pagina));
    router.replace(`${pathname}?${next.toString()}`);
  }

  const comprasQuery = useCompras(filtros);
  const sectoresQuery = useSectores();
  /** Default del backend cuando no se pasa nada: `true` (R7). El checkbox refleja ese default visualmente. */
  const soloEnCursoVisible = filtros.soloEnCurso ?? true;

  const columns: Column<CompraListItem>[] = [
    { key: "numero", header: "Número" },
    // Fecha sin parsear ("YYYY-MM-DD" del backend): parsearla con `new Date()`
    // y reformatear corre el riesgo de mostrar el día anterior por timezone
    // (mismo criterio que `ciclo-row.tsx`, que muestra `fechaInicio`/`fechaFin` crudas).
    { key: "fechaSolicitud", header: "Fecha" },
    { key: "motivo", header: "Motivo" },
    {
      key: "estado",
      header: "Estado",
      render: (row) => <EstadoCompraBadge estado={row.estado} />,
    },
    {
      key: "totalesPorMoneda",
      header: "Totales por moneda",
      render: (row) => formatearTotalesPorMoneda(row.totalesPorMoneda),
    },
    {
      key: "comprado",
      header: "Progreso",
      render: (row) => (
        <div className="flex gap-1">
          <Badge variant={row.comprado ? "success" : "outline"}>Comprado</Badge>
          <Badge variant={row.cerrado ? "success" : "outline"}>Cerrado</Badge>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Compras"
        description="Solicitudes de compra del ciclo activo"
        actions={
          <Can permiso="COMPRAS:ALTAS">
            <CompraCreateDialog />
          </Can>
        }
      />

      <FilterBar>
        <div className="flex items-center gap-2">
          <Checkbox
            id="filtro-solo-en-curso"
            checked={soloEnCursoVisible}
            onCheckedChange={(checked) =>
              updateFiltros({ soloEnCurso: checked === true ? undefined : false })
            }
          />
          <label htmlFor="filtro-solo-en-curso" className="text-sm text-foreground">
            Solo en curso
          </label>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="filtro-sector" className="sr-only">
            Sector
          </label>
          <Select
            id="filtro-sector"
            value={filtros.sectorId ?? ""}
            onChange={(e) => updateFiltros({ sectorId: e.target.value || undefined })}
          >
            <option value="">Todos los sectores</option>
            {(sectoresQuery.data ?? []).map((sector) => (
              <option key={sector.id} value={sector.id}>
                {sector.nombre}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex items-center gap-1">
          <label htmlFor="filtro-fecha-desde" className="sr-only">
            Fecha desde
          </label>
          <Input
            id="filtro-fecha-desde"
            type="date"
            value={filtros.fechaDesde ?? ""}
            onChange={(e) => updateFiltros({ fechaDesde: e.target.value || undefined })}
          />
          <span className="text-sm text-muted-foreground">a</span>
          <label htmlFor="filtro-fecha-hasta" className="sr-only">
            Fecha hasta
          </label>
          <Input
            id="filtro-fecha-hasta"
            type="date"
            value={filtros.fechaHasta ?? ""}
            onChange={(e) => updateFiltros({ fechaHasta: e.target.value || undefined })}
          />
        </div>
      </FilterBar>

      <DataTable
        columns={columns}
        data={comprasQuery.data?.items ?? []}
        getRowKey={(row) => row.id}
        isLoading={comprasQuery.isLoading}
        error={comprasQuery.isError ? "No se pudieron cargar las compras." : undefined}
        onRetry={() => comprasQuery.refetch().catch(notifyError)}
        onRowClick={(row) => router.push(`/compras/${row.id}`)}
        emptyTitle="Sin compras"
        emptyDescription="Todavía no hay solicitudes de compra registradas."
      />

      {comprasQuery.data && (
        <Pagination
          page={comprasQuery.data.pagina}
          pageSize={comprasQuery.data.porPagina}
          total={comprasQuery.data.total}
          onPageChange={irAPagina}
        />
      )}
    </div>
  );
}
