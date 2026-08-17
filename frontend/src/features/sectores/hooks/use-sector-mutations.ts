"use client";

/**
 * use-sector-mutations — CONTAINER hooks para el CRUD del catálogo de
 * sectores (Admin > Catálogos, gate `AdminClienteGuard` en el backend, WU-31
 * `compras-tres-etapas-y-sectores` R10). Mismo patrón que
 * `features/catalogos/hooks/use-catalogo-mutations.ts` (tipos de ticket).
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import { notifyError, notifySuccess } from "@/shared/lib/toast";
import type { CambiarEstadoActivoSectorDto, CreateSectorDto, EditSectorDto, Sector } from "../types";

export function useCrearSector() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateSectorDto) => apiFetch<Sector>("sectores", { method: "POST", json: dto }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sectores"] });
      notifySuccess("Sector creado.");
    },
    onError: notifyError,
  });
}

export function useEditarSector(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: EditSectorDto) => apiFetch<Sector>(`sectores/${id}`, { method: "PATCH", json: dto }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sectores"] });
      notifySuccess("Sector actualizado.");
    },
    onError: notifyError,
  });
}

export function useCambiarEstadoActivoSector(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CambiarEstadoActivoSectorDto) =>
      apiFetch<Sector>(`sectores/${id}/estado`, { method: "PATCH", json: dto }),
    onSuccess: (sector) => {
      queryClient.invalidateQueries({ queryKey: ["sectores"] });
      notifySuccess(sector.activo ? "Sector activado." : "Sector dado de baja.");
    },
    onError: notifyError,
  });
}
