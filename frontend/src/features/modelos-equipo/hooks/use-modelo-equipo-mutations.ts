"use client";

/**
 * use-modelo-equipo-mutations — CONTAINER hooks para el CRUD del catálogo de
 * modelos de equipo (Admin > Modelos de equipo, gate `AdminClienteGuard` en
 * el backend). Mismo patrón que `use-unidad-medida-mutations.ts`.
 *
 * El 422 de par duplicado (`marca`+`modelo` ya existente, activo o inactivo)
 * NO se intercepta acá: llega como error genérico y lo maneja `notifyError`
 * en el diálogo (WU-2) — no hay campo `codigo` que resaltar en el mensaje, a
 * diferencia de `FamiliaInsumoCodigoDuplicadoError`.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import { notifyError, notifySuccess } from "@/shared/lib/toast";
import type {
  CambiarEstadoActivoModeloEquipoDto,
  CreateModeloEquipoDto,
  EditModeloEquipoDto,
  ModeloEquipo,
} from "../types";

export function useCrearModeloEquipo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateModeloEquipoDto) =>
      apiFetch<ModeloEquipo>("modelos-equipo", { method: "POST", json: dto }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["modelos-equipo"] });
      notifySuccess("Modelo de equipo creado.");
    },
    onError: notifyError,
  });
}

export function useEditarModeloEquipo(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: EditModeloEquipoDto) =>
      apiFetch<ModeloEquipo>(`modelos-equipo/${id}`, { method: "PATCH", json: dto }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["modelos-equipo"] });
      notifySuccess("Modelo de equipo actualizado.");
    },
    onError: notifyError,
  });
}

export function useCambiarEstadoActivoModeloEquipo(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CambiarEstadoActivoModeloEquipoDto) =>
      apiFetch<ModeloEquipo>(`modelos-equipo/${id}/estado`, { method: "PATCH", json: dto }),
    onSuccess: (modelo) => {
      queryClient.invalidateQueries({ queryKey: ["modelos-equipo"] });
      notifySuccess(modelo.activo ? "Modelo de equipo activado." : "Modelo de equipo dado de baja.");
    },
    onError: notifyError,
  });
}
