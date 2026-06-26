"use client";

/**
 * useEquipos — query hook for the equipos list.
 *
 * Uses TanStack Query with the existing queryKeys factory (query-keys.ts).
 * apiFetch handles the BFF proxy and 401 single-flight refresh transparently.
 *
 * Design: Container/Presentational — all data-fetching lives here, not in EquiposList.
 * Spec: [SPEC:frontend-equipos/lista-equipos]
 */

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import { queryKeys } from "@/shared/api/query-keys";
import type { Equipo } from "../types";

export function useEquipos() {
  return useQuery({
    queryKey: queryKeys.equipos.all,
    queryFn: () => apiFetch<Equipo[]>("equipos"),
  });
}
