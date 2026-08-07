"use client";

/**
 * use-usuario-modulos — CONTAINER hooks para leer/asignar los módulos
 * funcionales de un usuario en el tenant del actor (feature 5.2 CAPA 4).
 *
 * `useUsuarioModulos` está deshabilitado por defecto (`enabled: false`): el
 * control de asignación lo activa recién cuando el popover se abre, para no
 * disparar N requests (uno por fila) al montar la tabla. `useAsignarModulos`
 * invalida el prefijo `["usuarios"]` (refresca la lista) y la query puntual de
 * módulos del usuario editado.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import { notifyError, notifySuccess } from "@/shared/lib/toast";

export function useUsuarioModulos(usuarioId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["usuario-modulos", usuarioId],
    queryFn: async () => {
      const res = await apiFetch<{ modulos: string[] }>(`usuarios/${usuarioId}/modulos`);
      return res.modulos;
    },
    enabled,
    staleTime: 30_000,
  });
}

export function useAsignarModulos(usuarioId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (modulos: string[]) =>
      apiFetch<{ usuarioId: string; modulos: string[] }>(`usuarios/${usuarioId}/modulos`, {
        method: "PATCH",
        json: { modulos },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["usuarios"] });
      queryClient.invalidateQueries({ queryKey: ["usuario-modulos", usuarioId] });
      notifySuccess("Módulos actualizados.");
    },
    onError: notifyError,
  });
}
