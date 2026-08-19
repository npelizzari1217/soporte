"use client";

/**
 * DataTable — generic, typed table primitive: sortable columns, density,
 * and the three premium states (loading=skeleton, empty=EmptyState,
 * error=ErrorState with retry). Composes `components/ui/table.tsx`.
 *
 * El vacío son en realidad DOS: sin datos y sin resultados para los filtros
 * aplicados (ver `hayFiltrosActivos`). Confundirlos ya costó caro una vez.
 *
 * Spec: R-M0 primitivas compartidas (DataTable columnas tipadas, sort,
 * densidad). ADR-8 (estados premium transversales).
 */
import type { ReactNode } from "react";
import { ArrowUpDown, FilterX, Inbox } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableSkeleton } from "./skeletons";
import { EmptyState } from "./empty-state";
import { ErrorState } from "./error-state";

/**
 * Copy del vacío CON filtros activos. Es fijo y compartido por todos los
 * listados a propósito: el mensaje útil acá no es "qué entidad falta" sino
 * "lo que ves está recortado por un filtro", y eso se dice igual en todas
 * las pantallas.
 */
const TITULO_VACIO_FILTRADO = "Sin resultados para los filtros aplicados";
const DESCRIPCION_VACIO_FILTRADO =
  "Ningún elemento coincide con los filtros aplicados. Ajustá los filtros o limpialos para ver el listado completo.";

export interface Column<T> {
  key: keyof T & string;
  header: string;
  sortable?: boolean;
  render?: (row: T) => ReactNode;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  getRowKey: (row: T) => string;
  isLoading?: boolean;
  error?: string;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
  density?: "comfortable" | "compact";
  onSort?: (key: string) => void;
  /** B1: fila clickeable (ej. navegar al detalle de un ticket). Sin esto, las filas no reaccionan al click. */
  onRowClick?: (row: T) => void;
  /**
   * ¿El listado está recortado por filtros en este momento? Cambia el copy
   * del vacío para atribuirlo a los filtros en vez de a la falta de datos.
   *
   * POR QUÉ existe la distinción: un vacío por filtro se veía EXACTAMENTE
   * igual que un vacío por no haber datos — mismo icono, mismo texto, cero
   * pistas de que había un filtro activo. Como los filtros viven en la URL
   * (ADR-2), alcanzó con un `busqueda`/`page` pegado de una sesión anterior
   * para que la Ayuda apareciera vacía; se leyó como "los datos no cargaron"
   * y mandó a revisar la base de producción, los tenants y los logs del
   * servidor. Los datos estaban perfectos. La pantalla mentía por omisión.
   *
   * El caso que más muerde es la PÁGINA: 5 artículos, 10 por página y un
   * `page=2` viejo en la URL dan vacío para siempre. Por eso los consumidores
   * tratan `page > 1` como filtro activo, no sólo la búsqueda y los selects.
   *
   * Omitirlo deja el comportamiento anterior intacto (retrocompatible).
   */
  hayFiltrosActivos?: boolean;
  /**
   * Limpia TODOS los filtros, incluida la página — la URL tiene que quedar
   * como recién entrado a la pantalla. Limpiar la búsqueda y dejar `page=2`
   * deja el listado igual de vacío y al usuario peor que antes.
   *
   * El botón sólo se ofrece si el consumidor pasa este callback: sin él, el
   * vacío filtrado avisa pero no promete una acción que no puede cumplir.
   */
  onLimpiarFiltros?: () => void;
}

export function DataTable<T>({
  columns,
  data,
  getRowKey,
  isLoading = false,
  error,
  onRetry,
  emptyTitle = "Sin resultados",
  emptyDescription = "No hay elementos para mostrar.",
  density = "comfortable",
  onSort,
  onRowClick,
  hayFiltrosActivos = false,
  onLimpiarFiltros,
}: DataTableProps<T>) {
  if (isLoading) {
    return <TableSkeleton rows={5} columns={columns.length} />;
  }

  if (error) {
    return <ErrorState message={error} onRetry={onRetry} />;
  }

  if (data.length === 0) {
    if (hayFiltrosActivos) {
      return (
        <EmptyState
          icon={FilterX}
          title={TITULO_VACIO_FILTRADO}
          description={DESCRIPCION_VACIO_FILTRADO}
          actionLabel={onLimpiarFiltros ? "Limpiar filtros" : undefined}
          onAction={onLimpiarFiltros}
        />
      );
    }
    return <EmptyState icon={Inbox} title={emptyTitle} description={emptyDescription} />;
  }

  const cellPadding = density === "compact" ? "py-1.5" : "py-3";

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {columns.map((column) => (
            <TableHead key={column.key}>
              {column.sortable ? (
                <button
                  type="button"
                  onClick={() => onSort?.(column.key)}
                  className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                >
                  {column.header}
                  <ArrowUpDown className="h-3 w-3" aria-hidden="true" />
                </button>
              ) : (
                column.header
              )}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((row) => (
          <TableRow
            key={getRowKey(row)}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            className={onRowClick ? "cursor-pointer hover:bg-muted/50" : undefined}
          >
            {columns.map((column) => (
              <TableCell key={column.key} className={cellPadding}>
                {column.render ? column.render(row) : String(row[column.key] ?? "")}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
