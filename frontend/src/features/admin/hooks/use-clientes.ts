"use client";

/**
 * useClientes — query hook para GET /clientes (listado de tenants).
 *
 * Solo disponible para el operador global (`is_global_admin: true`). La query se
 * deja `enabled: isGlobalAdmin` para que ningún otro rol dispare el fetch — el
 * backend igual lo rechazaría con 403 (GlobalAdminGuard), pero evitamos el
 * round-trip inútil y el ruido en consola.
 *
 * Spec: [SPEC:clientes-tenancy/GET /clientes]
 */

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import { queryKeys } from "@/shared/api/query-keys";
import { useSession } from "@/shared/hooks/use-session";
import type { Cliente } from "../types";

export function useClientes() {
  const { isGlobalAdmin } = useSession();

  return useQuery<Cliente[]>({
    queryKey: queryKeys.admin.clientes,
    queryFn: () => apiFetch<Cliente[]>("clientes"),
    enabled: isGlobalAdmin,
  });
}
