"use client";

/**
 * useCiclos — query hook para GET /ciclos (ciclos del tenant resuelto).
 *
 * X-Tenant-Id SOLO se envía cuando isGlobalAdmin === true y hay un clienteId
 * seleccionado en TenantContext (design ADR-3). El backend (TenantGuard) rechaza
 * con 403 a cualquier no-operador que envíe el header, así que la condición
 * `isGlobalAdmin &&` no es una optimización — es un requisito de seguridad de
 * transporte: un ADMINISTRADOR nunca debe enviar X-Tenant-Id, ni siquiera con su
 * propio tenant.
 *
 * queryKey incluye clienteId → TanStack Query re-fetchea automáticamente cuando
 * el operador cambia de cliente (cascade, admin-ui spec).
 *
 * Operador sin cliente seleccionado: query deshabilitada (no hay tenant que resolver).
 *
 * Spec: [SPEC:clientes-tenancy/GET /ciclos], [SPEC:admin-ui/Selectores]
 */

import { useContext } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import { queryKeys } from "@/shared/api/query-keys";
import { useSession } from "@/shared/hooks/use-session";
import { TenantContext } from "@/shared/providers/tenant-context";
import type { Ciclo } from "../types";

export function useCiclos() {
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
