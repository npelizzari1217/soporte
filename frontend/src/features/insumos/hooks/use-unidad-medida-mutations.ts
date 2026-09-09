"use client";

/**
 * use-unidad-medida-mutations — CONTAINER hooks para el CRUD del catálogo de
 * unidades de medida (Admin > Insumos, gate `AdminClienteGuard` en el
 * backend). Mismo patrón que `features/sectores/hooks/use-sector-mutations.ts`
 * y `use-familia-insumo-mutations.ts`.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import { notifyError, notifySuccess } from "@/shared/lib/toast";
import type {
  CambiarEstadoActivoUnidadMedidaDto,
  CreateUnidadMedidaDto,
  EditUnidadMedidaDto,
  UnidadMedida,
} from "../types";

export function useCrearUnidadMedida() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateUnidadMedidaDto) =>
      apiFetch<UnidadMedida>("unidades-medida", { method: "POST", json: dto }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["unidades-medida"] });
      notifySuccess("Unidad de medida creada.");
    },
    onError: notifyError,
  });
}

export function useEditarUnidadMedida(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: EditUnidadMedidaDto) =>
      apiFetch<UnidadMedida>(`unidades-medida/${id}`, { method: "PATCH", json: dto }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["unidades-medida"] });
      notifySuccess("Unidad de medida actualizada.");
    },
    onError: notifyError,
  });
}

export function useCambiarEstadoActivoUnidadMedida(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CambiarEstadoActivoUnidadMedidaDto) =>
      apiFetch<UnidadMedida>(`unidades-medida/${id}/estado`, { method: "PATCH", json: dto }),
    onSuccess: (unidad) => {
      queryClient.invalidateQueries({ queryKey: ["unidades-medida"] });
      notifySuccess(unidad.activo ? "Unidad de medida activada." : "Unidad de medida dada de baja.");
    },
    onError: notifyError,
  });
}
