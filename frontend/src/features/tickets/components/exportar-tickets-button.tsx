"use client";

/**
 * ExportarTicketsButton — dispara `GET /tickets/export` y le entrega el CSV
 * al usuario (sdd/exportar-listados-csv).
 *
 * Recibe los filtros por prop en lugar de leer la URL por su cuenta: el
 * requisito es que lo exportado coincida EXACTAMENTE con lo que se está
 * viendo, y la única forma de garantizarlo es que salga del mismo objeto de
 * filtros con el que `TicketsListView` pidió el listado (mismo criterio que
 * `ExportarComprasButton`).
 *
 * Sin gate de permiso propio: `GET /tickets/export` aplica el mismo alcance
 * por tipo que el listado (odd/permisos-por-tipo-ticket, D5 e), así que exporta
 * exactamente las filas que esta pantalla puede mostrar.
 *
 * **Delegación** (sdd/exportar-listados-csv, decisión D5): la descarga en sí
 * la resuelve el botón/hook compartidos — este componente sólo aporta lo
 * específico de tickets: el recurso, el nombre por defecto y la query string
 * armada a partir de los filtros de la pantalla.
 */
import { ExportarCsvButton } from "@/shared/components/exportar-csv-button";
import { buildExportTicketsQueryString } from "../hooks/use-exportar-tickets";
import type { TicketsFiltros } from "../types";

export interface ExportarTicketsButtonProps {
  /** Los mismos filtros con los que se pidió el listado visible. */
  filtros: TicketsFiltros;
}

export function ExportarTicketsButton({ filtros }: ExportarTicketsButtonProps) {
  return (
    <ExportarCsvButton
      recurso="tickets"
      nombrePorDefecto="tickets.csv"
      queryString={buildExportTicketsQueryString(filtros)}
    />
  );
}
