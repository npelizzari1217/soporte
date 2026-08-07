"use client";

/**
 * use-ciclos-mutations — CONTAINER hooks para adoptar/activar ciclos del
 * tenant (T4.5, `POST /ciclos` / `PATCH /ciclos/:id/activar`). Invalida el
 * MISMO query key que `useCiclos` (`features/dashboard/hooks/use-ciclos.ts`,
 * reusado acá — cross-feature, mismo criterio que catálogos) para que el
 * filtro de ciclo del dashboard refleje la adopción/activación al instante.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import { notifyError, notifySuccess } from "@/shared/lib/toast";
import type { CicloTenant } from "@/features/dashboard/types";

export function useAdoptarCiclo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (cicloVigenteId: string) =>
      apiFetch<CicloTenant>("ciclos", { method: "POST", json: { cicloVigenteId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ciclos"] });
      notifySuccess("Ciclo adoptado.");
    },
    onError: notifyError,
  });
}

export function useActivarCiclo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<CicloTenant>(`ciclos/${id}/activar`, { method: "PATCH" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ciclos"] });
      notifySuccess("Ciclo activado.");
    },
    onError: notifyError,
  });
}

export function useDesactivarCiclo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<CicloTenant>(`ciclos/${id}/desactivar`, { method: "PATCH" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ciclos"] });
      notifySuccess("Ciclo desactivado.");
    },
    onError: notifyError,
  });
}
