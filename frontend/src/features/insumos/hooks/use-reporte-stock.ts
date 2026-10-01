"use client";

/**
 * useReporteStock — CONTAINER hook para `GET /insumos/reporte-stock`.
 *
 * `staleTime: 0` explícito, como `useStockInsumo`: el reporte es una foto del
 * saldo y se mira para saber cuánto hay AHORA; el `QueryClient` global cachea
 * 30 s y eso lo dejaría desactualizado. El `generadoEn` que devuelve es el
 * instante de esa foto.
 *
 * La clave `["reporte-stock", filtros]` va fuera del prefijo `["insumos"]`
 * (mismo criterio que `["insumo", id, "stock"]`) y cambia con cada filtro. La
 * respuesta se valida con el schema Zod espejo del backend. El query string lo
 * arma el serializador compartido con el botón de exportación.
 *
 * El endpoint exige `INSUMOS:LECTURA`; la vista que lo consume gatea por ese
 * permiso (la autoridad sigue siendo el servidor).
 */
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import {
  serializarFiltrosReporteStock,
  type FiltrosReporteStock,
} from "../lib/filtros-reporte-stock";
import { reporteStockSchema, type ReporteStock } from "../types";

/**
 * @param filtros Filtros activos del reporte.
 * @returns La query con `generadoEn` y las filas.
 */
export function useReporteStock(filtros: FiltrosReporteStock): UseQueryResult<ReporteStock, Error> {
  const qs = serializarFiltrosReporteStock(filtros);
  return useQuery({
    staleTime: 0,
    queryKey: ["reporte-stock", filtros],
    queryFn: async () =>
      reporteStockSchema.parse(
        await apiFetch<unknown>(`insumos/reporte-stock${qs ? `?${qs}` : ""}`),
      ),
  });
}
