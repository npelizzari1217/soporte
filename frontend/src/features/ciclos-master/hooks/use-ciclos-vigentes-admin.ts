"use client";

/**
 * use-ciclos-vigentes-admin — CONTAINER hook para `GET /ciclos-vigentes/admin`
 * (sdd/ciclos-abm-root), exclusivo ROOT. Retorna el catálogo COMPLETO
 * (incluye soft-deleted) — a diferencia de `useCiclosVigentes`
 * (`features/ciclos`, solo activos, para el selector de adopción del tenant).
 */
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import type { CicloVigenteAdmin } from "../types";

export function useCiclosVigentesAdmin() {
  return useQuery({
    queryKey: ["ciclos-vigentes-admin"],
    queryFn: () => apiFetch<CicloVigenteAdmin[]>("ciclos-vigentes/admin"),
    staleTime: 30_000,
  });
}
