"use client";

/**
 * use-catalogo-mutations — CONTAINER hooks para el CRUD editable de
 * catálogos (Admin > Catálogos, gate `catalogo:gestionar`, T4.2/T4.3).
 * Invalida los MISMOS query keys que `useTiposTicket`/`usePrioridades`
 * (`features/tickets/hooks/use-catalogos.ts`) — la lectura se REUSA en toda
 * la app (selects de tickets/dashboard), así que una edición acá refresca
 * también esas vistas.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import { notifyError, notifySuccess } from "@/shared/lib/toast";
import type { Prioridad, TipoTicket } from "@/features/tickets/types";
import type {
  CambiarEstadoActivoDto,
  CreatePrioridadDto,
  CreateTipoTicketDto,
  EditPrioridadDto,
  EditTipoTicketDto,
} from "../types";

export function useCrearTipoTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateTipoTicketDto) =>
      apiFetch<TipoTicket>("catalogos/tipos-ticket", { method: "POST", json: dto }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["catalogos", "tipos-ticket"] });
      notifySuccess("Tipo de ticket creado.");
    },
    onError: notifyError,
  });
}

export function useEditarTipoTicket(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: EditTipoTicketDto) =>
      apiFetch<TipoTicket>(`catalogos/tipos-ticket/${id}`, { method: "PATCH", json: dto }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["catalogos", "tipos-ticket"] });
      notifySuccess("Tipo de ticket actualizado.");
    },
    onError: notifyError,
  });
}

export function useCambiarEstadoActivoTipoTicket(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CambiarEstadoActivoDto) =>
      apiFetch<TipoTicket>(`catalogos/tipos-ticket/${id}/estado`, { method: "PATCH", json: dto }),
    onSuccess: (tipo) => {
      queryClient.invalidateQueries({ queryKey: ["catalogos", "tipos-ticket"] });
      notifySuccess(tipo.activo ? "Tipo de ticket activado." : "Tipo de ticket dado de baja.");
    },
    onError: notifyError,
  });
}

export function useCrearPrioridad() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreatePrioridadDto) =>
      apiFetch<Prioridad>("catalogos/prioridades", { method: "POST", json: dto }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["catalogos", "prioridades"] });
      notifySuccess("Prioridad creada.");
    },
    onError: notifyError,
  });
}

export function useEditarPrioridad(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: EditPrioridadDto) =>
      apiFetch<Prioridad>(`catalogos/prioridades/${id}`, { method: "PATCH", json: dto }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["catalogos", "prioridades"] });
      notifySuccess("Prioridad actualizada.");
    },
    onError: notifyError,
  });
}

export function useCambiarEstadoActivoPrioridad(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CambiarEstadoActivoDto) =>
      apiFetch<Prioridad>(`catalogos/prioridades/${id}/estado`, { method: "PATCH", json: dto }),
    onSuccess: (prioridad) => {
      queryClient.invalidateQueries({ queryKey: ["catalogos", "prioridades"] });
      notifySuccess(prioridad.activo ? "Prioridad activada." : "Prioridad dada de baja.");
    },
    onError: notifyError,
  });
}
