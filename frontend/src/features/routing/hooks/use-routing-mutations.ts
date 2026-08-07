"use client";

/**
 * use-routing-mutations — CONTAINER hooks para `POST`/`DELETE
 * /routing/:usuarioId/:tipoTicketId` (T4.8, `RoutingController`). Invalidan
 * `["routing"]` (`use-routing.ts`, item 5 backend-gaps) para que la lista
 * de asociaciones refleje el cambio al instante.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import { notifyError, notifySuccess } from "@/shared/lib/toast";

export function useAsociarRouting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ usuarioId, tipoTicketId }: { usuarioId: string; tipoTicketId: string }) =>
      apiFetch<{ usuarioId: string; tipoTicketId: string }>(`routing/${usuarioId}/${tipoTicketId}`, {
        method: "POST",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["routing"] });
      notifySuccess("Técnico asociado al tipo de ticket.");
    },
    onError: notifyError,
  });
}

export function useDesasociarRouting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ usuarioId, tipoTicketId }: { usuarioId: string; tipoTicketId: string }) =>
      apiFetch<void>(`routing/${usuarioId}/${tipoTicketId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["routing"] });
      notifySuccess("Técnico desasociado del tipo de ticket.");
    },
    onError: notifyError,
  });
}
