"use client";

/**
 * use-reparacion-mutations — CONTAINER hook para crear reparaciones (T5.8).
 * Las tareas de una reparación usan los hooks genéricos del ticket
 * (`features/tickets/hooks/use-tareas-ticket.ts`, odd/tareas-con-tecnico T6).
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import { notifyError, notifySuccess } from "@/shared/lib/toast";
import type { CrearTicketEdilicioDto, EditarReparacionDto, ReparacionListItem, TicketEdilicia } from "../types";

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

/**
 * Edita una reparación que no se empezó a trabajar (odd/detalle-ticket-legible, S6):
 * `PATCH /reparaciones/:id`. Un campo ausente no se toca y `null` limpia. Al guardar se refresca el
 * listado, que es de donde salen los datos precargados del diálogo.
 */
export function useEditarReparacion(reparacionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: EditarReparacionDto) =>
      apiFetch<TicketEdilicia>(`reparaciones/${reparacionId}`, { method: "PATCH", json: dto }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reparaciones"] });
      notifySuccess("Reparación actualizada.");
    },
    onError: notifyError,
  });
}
