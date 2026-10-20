"use client";

/**
 * use-reparaciones — CONTAINER hook para `GET /reparaciones`, paginado en el
 * servidor (odd/reparaciones-paginadas). La query key lleva los filtros: cada
 * página y filtro cachea por separado, y el prefijo `["reparaciones"]` es el
 * que invalidan las mutaciones de subtareas, comentarios y compras.
 */
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import type { ListReparacionesResponse, ReparacionesFiltros } from "../types";

/**
 * Query string de `GET /reparaciones`. `bloqueo` se omite cuando es `TODAS`,
 * que es el default del servidor.
 *
 * @param filtros Página, tamaño y filtro de bloqueo.
 * @returns La query string sin el `?` inicial.
 */
export function buildReparacionesQueryString(filtros: ReparacionesFiltros): string {
  const params = new URLSearchParams();
  params.set("pagina", String(filtros.pagina));
  params.set("porPagina", String(filtros.porPagina));
  if (filtros.bloqueo && filtros.bloqueo !== "TODAS") params.set("bloqueo", filtros.bloqueo);
  return params.toString();
}

/**
 * Una página del listado de reparaciones.
 *
 * @param filtros Página, tamaño y filtro de bloqueo.
 * @returns La query de react-query con la página y su metadata.
 */
export function useReparaciones(filtros: ReparacionesFiltros) {
  return useQuery({
    queryKey: ["reparaciones", filtros],
    queryFn: () => apiFetch<ListReparacionesResponse>(`reparaciones?${buildReparacionesQueryString(filtros)}`),
  });
}
