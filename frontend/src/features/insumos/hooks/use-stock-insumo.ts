"use client";

/**
 * useStockInsumo — CONTAINER hook para `GET /insumos/:insumoId/stock`: cuánto
 * hay de un insumo y cómo se lee ese saldo contra su punto de reposición.
 *
 * A DIFERENCIA de los tres catálogos de este módulo, va SIN `staleTime`: el
 * default de TanStack Query (`0`, revalidar al montar y al volver a la
 * pestaña) es lo correcto acá. Un catálogo cambia cuando un administrador
 * edita el ABM; el stock cambia con CADA movimiento —entrada, salida o
 * ajuste—, incluido uno que registró otro usuario hace un segundo. Cachearlo
 * cinco minutos mostraría un saldo viejo en la pantalla que se mira
 * justamente para saber cuánto queda.
 *
 * El endpoint SÍ exige `INSUMOS:LECTURA` en el backend (a diferencia del
 * catálogo, que es lectura abierta), así que la ficha que lo consume gatea la
 * vista por ese mismo permiso. La autoridad sigue siendo el servidor (ADR-4);
 * el gate de la UI solo evita ofrecer un camino que termina en 403.
 *
 * `queryKey` en SINGULAR y fuera del prefijo `["insumos"]` del catálogo, mismo
 * criterio que `["equipo", id]` y `["compra", id]`: TanStack Query invalida por
 * prefijo, así que colgarlo de `["insumos", …]` haría que refrescar el catálogo
 * refetchee el stock de todas las fichas abiertas, y viceversa. Son dos
 * lecturas con ritmos distintos.
 */
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import type { StockInsumo } from "../types";

/**
 * @param insumoId Insumo cuya existencia se consulta.
 * @returns La query con el saldo, el punto de reposición y el estado ya resuelto.
 */
export function useStockInsumo(insumoId: string) {
  return useQuery({
    queryKey: ["insumo", insumoId, "stock"],
    queryFn: () => apiFetch<StockInsumo>(`insumos/${insumoId}/stock`),
    enabled: !!insumoId,
  });
}
