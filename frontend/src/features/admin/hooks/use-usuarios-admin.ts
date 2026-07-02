"use client";

/**
 * useUsuariosAdmin — query hook para GET /usuarios (usuarios del tenant resuelto).
 *
 * X-Tenant-Id SOLO se envía cuando isGlobalAdmin === true y hay un clienteId
 * seleccionado en TenantContext (mismo criterio de seguridad de transporte que
 * useCiclos — ver design ADR-3). Un ADMINISTRADOR nunca envía el header.
 *
 * queryKey incluye clienteId → TanStack Query re-fetchea automáticamente cuando
 * el operador cambia de cliente.
 *
 * Spec: [SPEC:admin-ui/Pantalla Usuarios]
 */

import { useContext } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import { queryKeys } from "@/shared/api/query-keys";
import { useSession } from "@/shared/hooks/use-session";
import { TenantContext } from "@/shared/providers/tenant-context";
import type { Usuario } from "../types";

export function useUsuariosAdmin() {
  const { clienteId } = useContext(TenantContext);
  const { isGlobalAdmin } = useSession();

  return useQuery<Usuario[]>({
    queryKey: queryKeys.admin.usuarios(clienteId),
    queryFn: () => {
      const headers =
        isGlobalAdmin && clienteId ? { "X-Tenant-Id": clienteId } : undefined;
      return apiFetch<Usuario[]>("usuarios", { headers });
    },
    enabled: !isGlobalAdmin || Boolean(clienteId),
  });
}
