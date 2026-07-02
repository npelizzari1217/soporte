"use client";

/**
 * useActivarCiclo — mutación PATCH /ciclos/:id/activar.
 *
 * Activa el ciclo indicado; el backend desactiva atómicamente los demás
 * ciclos del tenant en la misma transacción (ver ciclos.controller.ts).
 * Invalida `queryKeys.admin.ciclos(clienteId)` al completar, lo que refresca
 * tanto CiclosPage como CicloSelector (comparten el mismo queryKey).
 *
 * X-Tenant-Id condicional a `isGlobalAdmin && clienteId` — mismo gotcha de
 * seguridad que el resto de las queries/mutaciones de ciclos (design ADR-3):
 * el backend responde 403 a cualquier no-operador que envíe el header.
 *
 * Spec: [SPEC:admin-ui/Pantalla Ciclos — Activar ciclo]
 */

import { useContext } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import { queryKeys } from "@/shared/api/query-keys";
import { useSession } from "@/shared/hooks/use-session";
import { TenantContext } from "@/shared/providers/tenant-context";
import type { ApiError } from "@/shared/api/types";
import type { Ciclo } from "../types";

export function useActivarCiclo() {
  const qc = useQueryClient();
  const { clienteId } = useContext(TenantContext);
  const { isGlobalAdmin } = useSession();

  return useMutation<Ciclo, ApiError, string>({
    mutationFn: (id) => {
      const headers =
        isGlobalAdmin && clienteId ? { "X-Tenant-Id": clienteId } : undefined;
      return apiFetch<Ciclo>(`ciclos/${id}/activar`, {
        method: "PATCH",
        headers,
      });
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: queryKeys.admin.ciclos(clienteId) }),
  });
}
