"use client";

/**
 * useReparaciones — query hook for the reparaciones list.
 *
 * Uses TanStack Query with the existing queryKeys factory (query-keys.ts).
 * apiFetch handles the BFF proxy and 401 single-flight refresh transparently.
 *
 * Design: Container/Presentational — all data-fetching lives here, not in ReparacionesList.
 * Spec: [SPEC:frontend-reparaciones/lista-reparaciones]
 */

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import { queryKeys } from "@/shared/api/query-keys";
import type { Reparacion } from "../types";

export function useReparaciones() {
  return useQuery({
    queryKey: queryKeys.reparaciones.all,
    queryFn: () => apiFetch<Reparacion[]>("reparaciones"),
  });
}
