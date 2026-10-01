"use client";

/**
 * useUnidadesInsumo — CONTAINER hook para `GET /insumos/:insumoId/unidades`:
 * las unidades por número de serie de un insumo `SERIE`, con su estado y su
 * equipo.
 *
 * Trae TODAS las unidades, sin el filtro `?estado=` del endpoint: la sección
 * filtra en el cliente para poder contar las pendientes de serie sobre el
 * universo completo y no sobre la vista filtrada. La `queryKey` queda exacta,
 * `["insumo", id, "unidades"]`, así que las mutaciones que invalidan
 * `["insumo", id]` (seguimiento, movimientos) la refrescan por prefijo.
 *
 * `staleTime: 0` explícito, por el mismo motivo que `useStockInsumo`: el estado
 * de una unidad cambia con cada instalación, entrega o descarte, incluidos los
 * que hizo otro usuario hace un segundo. `enabled` lo gobierna el caller: solo
 * un insumo `SERIE` tiene unidades que pedir (el endpoint de un `NINGUNO`
 * devuelve vacío, pero la consulta sobra).
 */
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import type { UnidadInsumo } from "../types";

/**
 * @param insumoId Insumo cuyas unidades se listan.
 * @param habilitada `false` evita la consulta (insumo sin seguimiento por serie).
 * @returns La query con todas las unidades del insumo.
 */
export function useUnidadesInsumo(
  insumoId: string,
  habilitada = true,
): UseQueryResult<UnidadInsumo[], Error> {
  return useQuery({
    staleTime: 0,
    queryKey: ["insumo", insumoId, "unidades"],
    queryFn: () => apiFetch<UnidadInsumo[]>(`insumos/${insumoId}/unidades`),
    enabled: !!insumoId && habilitada,
  });
}
