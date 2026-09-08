"use client";

/**
 * use-familia-insumo-mutations — CONTAINER hooks para el CRUD del catálogo de
 * familias de insumo (Admin > Insumos, gate `AdminClienteGuard` en el
 * backend). Mismo patrón que `features/sectores/hooks/use-sector-mutations.ts`.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import { notifyError, notifySuccess } from "@/shared/lib/toast";
import type {
  CambiarEstadoActivoFamiliaInsumoDto,
  CreateFamiliaInsumoDto,
  EditFamiliaInsumoDto,
  FamiliaInsumo,
} from "../types";

export function useCrearFamiliaInsumo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateFamiliaInsumoDto) =>
      apiFetch<FamiliaInsumo>("familias-insumo", { method: "POST", json: dto }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["familias-insumo"] });
      notifySuccess("Familia de insumo creada.");
    },
    onError: notifyError,
  });
}

export function useEditarFamiliaInsumo(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: EditFamiliaInsumoDto) =>
      apiFetch<FamiliaInsumo>(`familias-insumo/${id}`, { method: "PATCH", json: dto }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["familias-insumo"] });
      notifySuccess("Familia de insumo actualizada.");
    },
    onError: notifyError,
  });
}

export function useCambiarEstadoActivoFamiliaInsumo(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CambiarEstadoActivoFamiliaInsumoDto) =>
      apiFetch<FamiliaInsumo>(`familias-insumo/${id}/estado`, { method: "PATCH", json: dto }),
    onSuccess: (familia) => {
      queryClient.invalidateQueries({ queryKey: ["familias-insumo"] });
      notifySuccess(familia.activo ? "Familia de insumo activada." : "Familia de insumo dada de baja.");
    },
    onError: notifyError,
  });
}
