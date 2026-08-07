"use client";

/**
 * use-ciclos — CONTAINER hook para `GET /ciclos` (G4, `sdd/beta-frontend/
 * design` ADR-5). Sin gate de permiso — cualquier usuario autenticado del
 * tenant puede leerlo (alimenta el filtro de ciclo del dashboard, T2.6).
 */
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import type { ListarCiclosResponse } from "../types";

export function useCiclos() {
  return useQuery({
    queryKey: ["ciclos"],
    queryFn: () => apiFetch<ListarCiclosResponse>("ciclos"),
    staleTime: 60_000,
  });
}
