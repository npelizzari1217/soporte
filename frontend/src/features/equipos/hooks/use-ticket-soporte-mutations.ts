"use client";

/**
 * use-crear-ticket-soporte — mutación para `POST /soporte` (T5.15). Gate
 * `ticket:crear` (TODOS los roles, incluido USUARIO) — INDEPENDIENTE de
 * `equipo:gestionar`, que gatea el inventario, no la creación del ticket.
 * `equipoId` es OPCIONAL (vínculo ticket↔equipo, espejo backend).
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import { notifyError, notifySuccess } from "@/shared/lib/toast";
import type { CrearTicketSoporteDto, TicketSoporte } from "../types";

export function useCrearTicketSoporte() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CrearTicketSoporteDto) => apiFetch<TicketSoporte>("soporte", { method: "POST", json: dto }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      notifySuccess("Ticket de soporte creado.");
    },
    onError: notifyError,
  });
}
