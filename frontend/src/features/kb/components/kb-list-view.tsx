"use client";

/**
 * KbListView — CONTAINER client component montado por `/kb` (ADR-1). Filtros
 * viven en la URL (searchParams, ADR-2) — mismo patrón que
 * `TicketsListView`. El backend YA filtra el scope de visibilidad (K3, según
 * `ticket:ver_todos` del actor) — este componente solo renderiza lo que
 * `GET /kb` devuelve, nunca re-filtra artículos internos client-side.
 */
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { useKbList } from "../hooks/use-kb-list";
import { DataTable, type Column } from "@/components/shared/data-table";
import { FilterBar } from "@/components/shared/filter-bar";
import { Pagination } from "@/components/shared/pagination";
import { PageHeader } from "@/components/shared/page-header";
import { Can } from "@/components/shared/can";
import { Badge } from "@/components/ui/badge";
import { notifyError } from "@/shared/lib/toast";
// Una sola fuente para el nombre visible del módulo: el menú lateral, la
// grilla de permisos y este título tienen que decir lo mismo siempre.
import { ETIQUETAS_MODULOS } from "@/shared/auth/etiquetas-modulos";
import { KbArticleCreateDialog } from "./kb-article-create-dialog";
import type { KbArticulo, KbFiltros } from "../types";

const PAGE_SIZE = 10;

export function KbListView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filtros: KbFiltros = useMemo(
    () => ({
      busqueda: searchParams.get("busqueda") ?? undefined,
      page: Number(searchParams.get("page") ?? "1"),
      pageSize: PAGE_SIZE,
    }),
    [searchParams],
  );

  function updateFiltros(patch: Partial<KbFiltros>, opts: { resetPage?: boolean } = { resetPage: true }) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined || value === "") next.delete(key);
      else next.set(key, String(value));
    }
    if (opts.resetPage) next.set("page", "1");
    router.replace(`${pathname}?${next.toString()}`);
  }

  /**
   * La PÁGINA cuenta como filtro. Con 5 artículos y 10 por página, un `page=2`
   * pegado en la URL de una sesión anterior deja el listado vacío para
   * siempre — es literalmente el caso que hizo leer un vacío por filtro como
   * "los datos no cargaron" y mandó a revisar la base de producción.
   */
  const hayFiltrosActivos = Boolean(filtros.busqueda) || (filtros.page ?? 1) > 1;

  /** Deja la URL como recién entrado a la pantalla: se van TODOS los filtros, la página incluida. */
  function limpiarFiltros() {
    router.replace(pathname);
  }

  const kbQuery = useKbList(filtros);

  const columns: Column<KbArticulo>[] = [
    { key: "titulo", header: "Título" },
    {
      key: "visibleParaSolicitante",
      header: "Visibilidad",
      render: (row) =>
        row.visibleParaSolicitante ? (
          <Badge variant="success">Publicado</Badge>
        ) : (
          <Badge variant="outline">Interno</Badge>
        ),
    },
  ];

  return (
    <div>
      <PageHeader
        title={ETIQUETAS_MODULOS.KB}
        actions={
          <Can permiso="KB:ALTAS">
            <KbArticleCreateDialog />
          </Can>
        }
      />

      <FilterBar
        searchPlaceholder="Buscar por título…"
        searchValue={filtros.busqueda ?? ""}
        onSearchChange={(value) => updateFiltros({ busqueda: value })}
      />

      <div className="mt-4">
        <DataTable
          columns={columns}
          data={kbQuery.data?.items ?? []}
          getRowKey={(row) => row.id}
          isLoading={kbQuery.isLoading}
          error={kbQuery.isError ? "No se pudieron cargar los artículos." : undefined}
          onRetry={() => kbQuery.refetch().catch(notifyError)}
          onRowClick={(row) => router.push(`/kb/${row.id}`)}
          emptyTitle="Sin artículos"
          emptyDescription="Todavía no hay artículos cargados."
          hayFiltrosActivos={hayFiltrosActivos}
          onLimpiarFiltros={limpiarFiltros}
        />
      </div>

      {kbQuery.data && (
        <Pagination
          page={kbQuery.data.page}
          pageSize={kbQuery.data.pageSize}
          total={kbQuery.data.total}
          onPageChange={(page) => updateFiltros({ page }, { resetPage: false })}
        />
      )}
    </div>
  );
}
