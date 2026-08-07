"use client";

/**
 * use-ciclos-vigentes — CONTAINER hook para `GET /ciclos-vigentes` (item 4
 * backend-gaps — cierra G6). Catálogo GLOBAL (`master.ciclos_vigentes`),
 * SOLO ciclos activos — alimenta el selector de `AdoptarCicloForm` (antes
 * UUID de texto libre sin catálogo).
 */
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import type { CicloVigente } from "../types";

export function useCiclosVigentes() {
  return useQuery({
    queryKey: ["ciclos-vigentes"],
    queryFn: () => apiFetch<CicloVigente[]>("ciclos-vigentes"),
    staleTime: 60_000,
  });
}
