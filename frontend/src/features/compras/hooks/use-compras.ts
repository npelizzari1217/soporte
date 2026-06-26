"use client";

/**
 * useCompras — query hook for the compras list.
 *
 * Uses TanStack Query with the existing queryKeys factory (query-keys.ts).
 * apiFetch handles the BFF proxy and 401 single-flight refresh transparently.
 *
 * Design: Container/Presentational — all data-fetching lives here, not in ComprasList.
 * Spec: [SPEC:frontend-compras/lista-compras]
 */

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import { queryKeys } from "@/shared/api/query-keys";
import type { Compra } from "../types";

export function useCompras() {
  return useQuery({
    queryKey: queryKeys.compras.all,
    queryFn: () => apiFetch<Compra[]>("compras"),
  });
}
