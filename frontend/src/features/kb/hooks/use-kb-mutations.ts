"use client";

/**
 * use-kb-mutations — CONTAINER hooks para las mutaciones de KB (R-M3 /
 * T3.4-T3.6). A diferencia de `use-ticket-mutations` (que distingue
 * detalle/timeline/lista), KB tiene un único namespace de query (`["kb", ...]`
 * para lista Y detalle) — invalidar el prefijo `["kb"]` alcanza a ambos sin
 * necesidad de listas de keys por mutación (TanStack Query hace match parcial
 * de prefijo por defecto).
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import { notifyError, notifySuccess } from "@/shared/lib/toast";
import type {
  CambiarVisibilidadKbArticuloDto,
  CrearKbArticuloDto,
  EditarKbArticuloDto,
  KbArticulo,
} from "../types";

export function useCrearKbArticulo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CrearKbArticuloDto) => apiFetch<KbArticulo>("kb", { method: "POST", json: dto }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kb"] });
      notifySuccess("Artículo creado.");
    },
    onError: notifyError,
  });
}

export function useEditarKbArticulo(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: EditarKbArticuloDto) => apiFetch<KbArticulo>(`kb/${id}`, { method: "PATCH", json: dto }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kb"] });
      notifySuccess("Artículo actualizado.");
    },
    onError: notifyError,
  });
}

export function useCambiarVisibilidadKbArticulo(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CambiarVisibilidadKbArticuloDto) =>
      apiFetch<KbArticulo>(`kb/${id}/visibilidad`, { method: "PATCH", json: dto }),
    onSuccess: (articulo) => {
      queryClient.invalidateQueries({ queryKey: ["kb"] });
      notifySuccess(articulo.visibleParaSolicitante ? "Artículo publicado." : "Artículo despublicado.");
    },
    onError: notifyError,
  });
}

export function useEliminarKbArticulo(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<void>(`kb/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kb"] });
      notifySuccess("Artículo eliminado.");
    },
    onError: notifyError,
  });
}
