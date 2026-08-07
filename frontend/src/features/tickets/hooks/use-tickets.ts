"use client";

/**
 * use-tickets — CONTAINER hook para `GET /tickets` (lista con filtros +
 * paginación server-side, R-M1 / T1.2). Query key namespaced por filtros
 * completos (ADR-2) — cada combinación de filtros cachea por separado.
 */
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import type { ListTicketsResponse, TicketsFiltros } from "../types";

/** Mapea `TicketsFiltros` a query string real de `GET /tickets` — omite claves undefined (nunca "clave=undefined"). */
export function buildTicketsQueryString(filtros: TicketsFiltros): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filtros)) {
    if (value === undefined || value === "") continue;
    params.set(key, String(value));
  }
  return params.toString();
}

export function useTickets(filtros: TicketsFiltros) {
  const qs = buildTicketsQueryString(filtros);
  return useQuery({
    queryKey: ["tickets", filtros],
    queryFn: () => apiFetch<ListTicketsResponse>(`tickets${qs ? `?${qs}` : ""}`),
  });
}
