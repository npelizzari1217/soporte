"use client";

/**
 * DataTable — generic, typed table primitive: sortable columns, density,
 * and the three premium states (loading=skeleton, empty=EmptyState,
 * error=ErrorState with retry). Composes `components/ui/table.tsx`.
 *
 * Spec: R-M0 primitivas compartidas (DataTable columnas tipadas, sort,
 * densidad). ADR-8 (estados premium transversales).
 */
import type { ReactNode } from "react";
import { ArrowUpDown, Inbox } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableSkeleton } from "./skeletons";
import { EmptyState } from "./empty-state";
import { ErrorState } from "./error-state";

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
}: DataTableProps<T>) {
  if (isLoading) {
    return <TableSkeleton rows={5} columns={columns.length} />;
  }

  if (error) {
    return <ErrorState message={error} onRetry={onRetry} />;
  }

  if (data.length === 0) {
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
