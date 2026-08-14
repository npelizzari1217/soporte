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
 * `EquiposListView` (`<Can permiso="equipo:gestionar">`), acá NO hay gate de
 * permiso envolviendo la tabla: `ComprasController.listar()` no declara
 * `@RequirePermissions`, así que un `<Can>` acá sería una restricción de UI
 * sin respaldo del backend.
 *
 * Alcance duro de PR-24 ("el LISTADO. Nada más"): esta vista es SOLO
 * LECTURA. No expone ningún botón de escritura (crear compra) — las
 * mutaciones quedan para PR-26/PR-27 (`sdd/redisenio-modulo-compras/
 * apply-progress-pr23` ya declaró explícitamente ese corte). Por eso la
 * regla "gatear por `compra:gestionar` las acciones de escritura que se
 * expongan desde el listado" no tiene, todavía, ningún botón que gatear.
 *
 * Paginación: SIEMPRE server-side vía `total` real de `ListarComprasResponse`
 * (S32/S33 — `PrismaCompraRepository` cuenta con un `count()` dedicado,
 * commit `b6c3552`). NUNCA se deriva de `items.length` (requisito duro).
 * `GET /compras` sólo acepta `pagina`/`porPagina` (`ComprasFiltros`) — no
 * hay más filtros en el backend, por eso no hay `FilterBar` acá.
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
import { DataTable, type Column } from "@/components/shared/data-table";
import { Pagination } from "@/components/shared/pagination";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { notifyError } from "@/shared/lib/toast";
import { EstadoCompraBadge } from "./estado-compra-badge";
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
    }),
    [searchParams],
  );

  function irAPagina(pagina: number) {
    const next = new URLSearchParams(searchParams.toString());
    next.set("pagina", String(pagina));
    router.replace(`${pathname}?${next.toString()}`);
  }

  const comprasQuery = useCompras(filtros);

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
      <PageHeader title="Compras" description="Solicitudes de compra del ciclo activo" />

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
