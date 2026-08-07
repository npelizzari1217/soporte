"use client";

/**
 * use-ubicacion-mutations — CONTAINER hooks para el CRUD de ubicaciones
 * (T5.7). Gate `catalogo:gestionar` (reuso pragmático, ADR-6 backend — no
 * existe `ubicacion:gestionar` dedicado).
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import { notifyError, notifySuccess } from "@/shared/lib/toast";
import type { CreateUbicacionDto, EditarUbicacionDto, Ubicacion } from "../types";

export function useCrearUbicacion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateUbicacionDto) => apiFetch<Ubicacion>("ubicaciones", { method: "POST", json: dto }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ubicaciones"] });
      notifySuccess("Ubicación creada.");
    },
    onError: notifyError,
  });
}

export function useEditarUbicacion(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: EditarUbicacionDto) =>
      apiFetch<Ubicacion>(`ubicaciones/${id}`, { method: "PATCH", json: dto }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ubicaciones"] });
      notifySuccess("Ubicación actualizada.");
    },
    onError: notifyError,
  });
}

export function useEliminarUbicacion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`ubicaciones/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ubicaciones"] });
      notifySuccess("Ubicación eliminada.");
    },
    onError: notifyError,
  });
}
