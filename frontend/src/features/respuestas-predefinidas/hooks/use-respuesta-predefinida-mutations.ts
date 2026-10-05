"use client";

/**
 * use-respuesta-predefinida-mutations — CONTAINER hooks para el CRUD del catálogo (Admin >
 * Catálogos; el backend gatea las escrituras con `AdminClienteGuard`). Mismo patrón que
 * `features/sectores/hooks/use-sector-mutations.ts`.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import { notifyError, notifySuccess } from "@/shared/lib/toast";
import type {
  CambiarEstadoActivoRespuestaPredefinidaDto,
  CreateRespuestaPredefinidaDto,
  EditRespuestaPredefinidaDto,
  RespuestaPredefinida,
} from "../types";

const QUERY_KEY = ["respuestas-predefinidas"];

export function useCrearRespuestaPredefinida() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateRespuestaPredefinidaDto) =>
      apiFetch<RespuestaPredefinida>("respuestas-predefinidas", { method: "POST", json: dto }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      notifySuccess("Respuesta creada.");
    },
    onError: notifyError,
  });
}

export function useEditarRespuestaPredefinida(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: EditRespuestaPredefinidaDto) =>
      apiFetch<RespuestaPredefinida>(`respuestas-predefinidas/${id}`, { method: "PATCH", json: dto }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      notifySuccess("Respuesta actualizada.");
    },
    onError: notifyError,
  });
}

export function useCambiarEstadoActivoRespuestaPredefinida(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CambiarEstadoActivoRespuestaPredefinidaDto) =>
      apiFetch<RespuestaPredefinida>(`respuestas-predefinidas/${id}/estado`, { method: "PATCH", json: dto }),
    onSuccess: (respuesta) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      notifySuccess(respuesta.activo ? "Respuesta activada." : "Respuesta desactivada.");
    },
    onError: notifyError,
  });
}
