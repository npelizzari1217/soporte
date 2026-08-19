/**
 * use-exportar-tickets — armado de la query string de `GET /tickets/export`
 * (sdd/exportar-listados-csv).
 *
 * La descarga en sí no vive acá: `ExportarTicketsButton` delega en el
 * hook/botón compartidos (`shared/hooks/use-exportar-csv.ts`,
 * `shared/components/exportar-csv-button.tsx`, decisión D5). Lo que SIGUE
 * siendo propio de tickets es `buildExportTicketsQueryString`: el criterio de
 * qué filtros viajan y con qué claves es de la feature, no de `shared/`
 * (traerlo ahí invertiría la dependencia — `shared/` terminaría importando
 * tipos de `features/*`), mismo criterio que `buildExportComprasQueryString`.
 */
import type { TicketsFiltros } from "../types";

/**
 * Claves de `TicketsFiltros` que la exportación NO manda.
 *
 * `GET /tickets/export` no acepta paginación porque exporta el universo
 * filtrado completo, no la página visible.
 */
const CLAVES_DE_PAGINACION: ReadonlySet<string> = new Set(["pagina", "porPagina"]);

/**
 * Mapea los filtros que la pantalla tiene aplicados a la query string de
 * `GET /tickets/export` (`ExportarTicketsQueryDto`), descartando la
 * paginación y las claves sin valor.
 *
 * @param filtros Los MISMOS filtros con los que se pidió el listado visible.
 * @returns Query string sin el `?` inicial; vacía si no hay filtros que mandar.
 */
export function buildExportTicketsQueryString(filtros: TicketsFiltros): string {
  const params = new URLSearchParams();
  for (const [clave, valor] of Object.entries(filtros)) {
    if (CLAVES_DE_PAGINACION.has(clave)) continue;
    if (valor === undefined || valor === "") continue;
    params.set(clave, String(valor));
  }
  return params.toString();
}
