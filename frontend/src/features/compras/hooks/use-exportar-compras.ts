/**
 * use-exportar-compras — armado de la query string de `GET /compras/export`
 * (docs/roadmap-comercial.md punto 1).
 *
 * La descarga en sí ya no vive acá: `ExportarComprasButton` delega en el
 * hook/botón compartidos (`shared/hooks/use-exportar-csv.ts`,
 * `shared/components/exportar-csv-button.tsx`, sdd/exportar-listados-csv,
 * decisión D5). Lo que SIGUE siendo propio de compras es
 * `buildExportComprasQueryString`: el criterio de qué filtros viajan y con
 * qué claves es de la feature, no de `shared/` (traerlo ahí invertiría la
 * dependencia — `shared/` terminaría importando tipos de `features/*`).
 */
import type { ComprasFiltros } from "../types";

/**
 * Claves de `ComprasFiltros` que la exportación NO manda.
 *
 * `GET /compras/export` no acepta paginación porque exporta el universo
 * filtrado completo. Mandarla igual no sería inofensivo: el DTO del backend
 * rechaza claves desconocidas y el usuario vería un 400 en vez de su archivo.
 */
const CLAVES_DE_PAGINACION: ReadonlySet<string> = new Set(["pagina", "porPagina"]);

/**
 * Mapea los filtros que la pantalla tiene aplicados a la query string de
 * `GET /compras/export` (`ExportarComprasQueryDto`), descartando la
 * paginación y las claves sin valor.
 *
 * @param filtros Los MISMOS filtros con los que se pidió el listado visible.
 * @returns Query string sin el `?` inicial; vacía si no hay filtros que mandar.
 */
export function buildExportComprasQueryString(filtros: ComprasFiltros): string {
  const params = new URLSearchParams();
  for (const [clave, valor] of Object.entries(filtros)) {
    if (CLAVES_DE_PAGINACION.has(clave)) continue;
    if (valor === undefined || valor === "") continue;
    params.set(clave, String(valor));
  }
  return params.toString();
}
