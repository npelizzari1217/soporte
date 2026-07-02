"use client";

/**
 * useCiclosAdmin — query hook para GET /ciclos, consumido por la pantalla de
 * administración de ciclos (CiclosPage).
 *
 * Comparte el mismo `queryKey` que `useCiclos` (usado por CicloSelector) —
 * `queryKeys.admin.ciclos(clienteId)` — para que ambos consumidores compartan
 * cache y las mutaciones de esta pantalla (useCrearCiclo/useActivarCiclo)
 * invaliden también el selector. Es un hook independiente (no un alias de
 * useCiclos) porque la pantalla de gestión evoluciona bajo su propio archivo
 * (tasks.md T6.4), desacoplada del contrato del selector de TenantContext.
 *
 * X-Tenant-Id SOLO se envía cuando isGlobalAdmin === true y hay un clienteId
 * seleccionado (design ADR-3). El backend (TenantGuard) responde 403 a
 * cualquier no-operador que envíe el header — la condición `isGlobalAdmin &&`
 * es un requisito de seguridad de transporte, no una optimización.
 *
 * Spec: [SPEC:clientes-tenancy/GET /ciclos], [SPEC:admin-ui/Pantalla Ciclos]
 */

import { useContext } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import { queryKeys } from "@/shared/api/query-keys";
import { useSession } from "@/shared/hooks/use-session";
import { TenantContext } from "@/shared/providers/tenant-context";
import type { Ciclo } from "../types";

export function useCiclosAdmin() {
  const { clienteId } = useContext(TenantContext);
  const { isGlobalAdmin } = useSession();

  return useQuery<Ciclo[]>({
    queryKey: queryKeys.admin.ciclos(clienteId),
    queryFn: () => {
      const headers =
        isGlobalAdmin && clienteId ? { "X-Tenant-Id": clienteId } : undefined;
      return apiFetch<Ciclo[]>("ciclos", { headers });
    },
    enabled: !isGlobalAdmin || Boolean(clienteId),
  });
}
