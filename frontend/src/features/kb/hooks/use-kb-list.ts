"use client";

/**
 * use-kb-list — CONTAINER hook para `GET /kb` (lista con filtros +
 * paginación server-side, R-M3 / T3.1). El backend YA soporta `busqueda`
 * server-side (`ListKbArticulosQueryDto`) — se sigue el mismo patrón de
 * `useTickets`/ADR-2 (estado de filtros en URL searchParams) en vez del
 * "búsqueda simple cliente" literal de la spec: es más consistente con el
 * resto del front y evita traer TODOS los artículos al cliente para filtrar.
 */
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import type { KbFiltros, ListKbArticulosResponse } from "../types";

/** Mapea `KbFiltros` a query string real de `GET /kb` — omite claves undefined. */
export function buildKbQueryString(filtros: KbFiltros): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filtros)) {
    if (value === undefined || value === "") continue;
    params.set(key, String(value));
  }
  return params.toString();
}

export function useKbList(filtros: KbFiltros) {
  const qs = buildKbQueryString(filtros);
  return useQuery({
    queryKey: ["kb", filtros],
    queryFn: () => apiFetch<ListKbArticulosResponse>(`kb${qs ? `?${qs}` : ""}`),
  });
}
