"use client";

/**
 * useHistorialUnidad — CONTAINER hook para
 * `GET /insumos/:insumoId/unidades/:unidadId/historial`: los hechos de la vida
 * de una unidad, del más viejo al más nuevo (el orden lo resuelve el servidor).
 *
 * La clave cuelga de `["insumo", id, "unidades"]`, así que toda invalidación
 * de las unidades (instalar, devolver, corregir un serial) refresca también el
 * historial abierto. `staleTime: 0` explícito, por el mismo motivo que las
 * demás lecturas de la ficha: un evento nuevo puede haberlo escrito otro
 * usuario hace un segundo. `unidadId` en `null` deja la consulta apagada (el
 * diálogo cerrado no consulta nada).
 */
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import type { EventoUnidad } from "../types";

/**
 * @param insumoId Insumo dueño de la unidad.
 * @param unidadId Unidad cuyo historial se pide, o `null` si no hay ninguna abierta.
 * @returns La query con los eventos de la unidad en orden cronológico.
 */
export function useHistorialUnidad(
  insumoId: string,
  unidadId: string | null,
): UseQueryResult<EventoUnidad[], Error> {
  return useQuery({
    staleTime: 0,
    queryKey: ["insumo", insumoId, "unidades", unidadId, "historial"],
    queryFn: () => apiFetch<EventoUnidad[]>(`insumos/${insumoId}/unidades/${unidadId}/historial`),
    enabled: !!insumoId && unidadId !== null,
  });
}
