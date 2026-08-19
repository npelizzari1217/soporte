"use client";

/**
 * ExportarComprasButton — dispara `GET /compras/export` y le entrega el CSV al
 * usuario (docs/roadmap-comercial.md punto 1).
 *
 * Recibe los filtros por prop en lugar de leer la URL por su cuenta: el
 * requisito es que lo exportado coincida EXACTAMENTE con lo que se está
 * viendo, y la única forma de garantizarlo es que salga del mismo objeto de
 * filtros con el que `ComprasListView` pidió el listado. Releer los
 * `searchParams` acá sería una segunda interpretación de la URL —con su propio
 * criterio de normalización— y bastaría un default distinto para que el
 * archivo no cuente lo mismo que la pantalla.
 *
 * Sin gate de permiso: `GET /compras/export` exige `COMPRAS:LECTURA`, la misma
 * acción que el listado, así que quien llegó a ver esta pantalla ya la tiene.
 * Un `<Can>` acá no protegería nada y quedaría desincronizado el día que
 * cambie el gate del listado (mismo criterio que el docblock de
 * `ComprasListView` sobre el resto de la vista).
 *
 * **Delegación** (sdd/exportar-listados-csv, decisión D5): la descarga en sí
 * la resuelve el botón/hook compartidos — este componente sólo aporta lo
 * específico de compras: el recurso, el nombre por defecto y la query string
 * armada a partir de los filtros de la pantalla.
 */
import { ExportarCsvButton } from "@/shared/components/exportar-csv-button";
import { buildExportComprasQueryString } from "../hooks/use-exportar-compras";
import type { ComprasFiltros } from "../types";

export interface ExportarComprasButtonProps {
  /** Los mismos filtros con los que se pidió el listado visible. */
  filtros: ComprasFiltros;
}

export function ExportarComprasButton({ filtros }: ExportarComprasButtonProps) {
  return (
    <ExportarCsvButton
      recurso="compras"
      nombrePorDefecto="compras.csv"
      queryString={buildExportComprasQueryString(filtros)}
      etiqueta="Exportar a Excel"
    />
  );
}
