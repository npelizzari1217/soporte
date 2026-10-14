"use client";

/**
 * use-reparacion-mutations — CONTAINER hook para crear reparaciones (T5.8).
 * Las tareas de una reparación usan los hooks genéricos del ticket
 * (`features/tickets/hooks/use-tareas-ticket.ts`, odd/tareas-con-tecnico T6).
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import { notifyError, notifySuccess } from "@/shared/lib/toast";
import type { CrearTicketEdilicioDto, ReparacionListItem } from "../types";

export function useCrearReparacion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CrearTicketEdilicioDto) =>
      apiFetch<ReparacionListItem>("reparaciones", { method: "POST", json: dto }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reparaciones"] });
      notifySuccess("Reparación creada.");
    },
    onError: notifyError,
  });
}
