"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import { notifyError, notifySuccess } from "@/shared/lib/toast";
import type { EditSlaConfigDto, SlaConfig } from "../types";

export function useEditarSlaConfig(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: EditSlaConfigDto) => apiFetch<SlaConfig>(`sla/config/${id}`, { method: "PATCH", json: dto }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sla", "config"] });
      notifySuccess("Configuración de SLA actualizada.");
    },
    onError: notifyError,
  });
}
