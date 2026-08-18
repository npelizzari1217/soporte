"use client";

/**
 * use-comentarios-reparacion — CONTAINER hooks de los comentarios de una
 * reparación.
 *
 * A diferencia de las subtareas (que se siembran desde el array embebido en
 * `GET /reparaciones` con `staleTime: Infinity`), los comentarios tienen `GET`
 * propio: acá hay un `useQuery` real con su `queryKey`, y la mutación
 * invalida esa key en vez de parchear el cache a mano. El backend ya devuelve
 * la lista más nuevo primero, así que el hook no reordena nada.
 *
 * `enabled` permite no pedir la lista hasta que el modal se abre.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import { notifyError, notifySuccess } from "@/shared/lib/toast";
import type { ComentarioReparacion, CrearComentarioReparacionDto } from "../types";

/** Query key de los comentarios de UNA reparación. Exportada para que el test y la mutación compartan la misma fuente. */
export function comentariosQueryKey(reparacionId: string): readonly [string, string] {
  return ["comentarios-reparacion", reparacionId] as const;
}

export function useComentariosReparacion(reparacionId: string, enabled = true) {
  return useQuery({
    queryKey: comentariosQueryKey(reparacionId),
    queryFn: () => apiFetch<ComentarioReparacion[]>(`reparaciones/${reparacionId}/comentarios`),
    enabled,
  });
}

export function useCrearComentarioReparacion(reparacionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CrearComentarioReparacionDto) =>
      apiFetch<ComentarioReparacion>(`reparaciones/${reparacionId}/comentarios`, { method: "POST", json: dto }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: comentariosQueryKey(reparacionId) });
      notifySuccess("Comentario agregado.");
    },
    onError: notifyError,
  });
}
