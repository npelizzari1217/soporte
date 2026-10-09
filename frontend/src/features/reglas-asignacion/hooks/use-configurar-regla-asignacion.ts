"use client";

/**
 * useConfigurarReglaAsignacion — `PUT /reglas-asignacion/:tipoId`. Un 422
 * (responsable no elegible) llega como `ApiError` y `notifyError` lo informa;
 * la lista no se invalida en error, así que la regla anterior se conserva.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import { notifyError, notifySuccess } from "@/shared/lib/toast";
import { reglaAsignacionFilaSchema } from "../schemas";
import type { ConfigurarReglaVariables } from "../types";

export function useConfigurarReglaAsignacion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ tipoId, responsableId }: ConfigurarReglaVariables) =>
      reglaAsignacionFilaSchema.parse(
        await apiFetch<unknown>(`reglas-asignacion/${tipoId}`, { method: "PUT", json: { responsableId } }),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reglas-asignacion"] });
      notifySuccess("Regla de asignación actualizada.");
    },
    onError: notifyError,
  });
}
