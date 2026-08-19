"use client";

/**
 * use-reparacion-mutations — CONTAINER hooks para crear reparaciones y
 * gestionar subtareas (T5.8-T5.10). Subtareas SIN `GET` de listado (gap de
 * backend, ver `types.ts`) — cache de sesión `["subtareas", reparacionId]`.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import { notifyError, notifySuccess } from "@/shared/lib/toast";
import type { CreateSubtareaDto, CrearTicketEdilicioDto, ReparacionListItem, SubtareaEdilicia } from "../types";

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

export function useCrearSubtarea(reparacionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateSubtareaDto) =>
      apiFetch<SubtareaEdilicia>(`reparaciones/${reparacionId}/subtareas`, { method: "POST", json: dto }),
    onSuccess: (subtarea) => {
      queryClient.setQueryData<SubtareaEdilicia[]>(["subtareas", reparacionId], (old = []) => [...old, subtarea]);
      // El porcentaje de avance NO vive en esta query: viaja en el listado, bajo
      // `["reparaciones"]`. Y una subtarea nueva cambia el DENOMINADOR del
      // cálculo (completadas sobre total), así que sin invalidar acá la fila
      // sigue mostrando el avance viejo hasta que alguien recarga.
      queryClient.invalidateQueries({ queryKey: ["reparaciones"] });
      notifySuccess("Subtarea agregada.");
    },
    onError: notifyError,
  });
}

export function useCompletarSubtarea(reparacionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (subtareaId: string) =>
      apiFetch<SubtareaEdilicia>(`reparaciones/subtareas/${subtareaId}/completar`, { method: "POST" }),
    onSuccess: (actualizada) => {
      queryClient.setQueryData<SubtareaEdilicia[]>(["subtareas", reparacionId], (old = []) =>
        old.map((s) => (s.id === actualizada.id ? actualizada : s)),
      );
      queryClient.invalidateQueries({ queryKey: ["reparaciones"] });
      notifySuccess("Subtarea completada.");
    },
    onError: notifyError,
  });
}

export function useEliminarSubtarea(reparacionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (subtareaId: string) =>
      apiFetch<void>(`reparaciones/subtareas/${subtareaId}`, { method: "DELETE" }),
    onSuccess: (_data, subtareaId) => {
      queryClient.setQueryData<SubtareaEdilicia[]>(["subtareas", reparacionId], (old = []) =>
        old.filter((s) => s.id !== subtareaId),
      );
      // Misma razón que en el alta: eliminar cambia el denominador del avance,
      // que vive en el listado y no en esta query.
      queryClient.invalidateQueries({ queryKey: ["reparaciones"] });
      notifySuccess("Subtarea eliminada.");
    },
    onError: notifyError,
  });
}
