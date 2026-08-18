"use client";

/**
 * use-usuario-permisos — CONTAINER hooks para leer/asignar la matriz de
 * permisos de un usuario en el tenant del actor (ADR-P10,
 * `sdd/matriz-permisos-por-usuario`). Reemplaza a `use-usuario-modulos.ts`
 * (ABM viejo, retirado en WU-7.6 junto con `GET/PATCH /usuarios/:id/modulos`).
 *
 * `useUsuarioPermisos` está deshabilitado por defecto (`enabled: false`): el
 * control de asignación lo activa recién cuando el popover se abre, mismo
 * criterio que el ABM viejo (evita N requests al montar la tabla).
 * `useAsignarPermisos`/`useAplicarPresetPermisos` invalidan el prefijo
 * `["usuarios"]` (refresca la lista) y la query puntual de permisos del
 * usuario editado.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import { notifyError, notifySuccess } from "@/shared/lib/toast";
import type { CodigoAccion } from "@/shared/auth/acciones";

export interface PermisosUsuarioTenant {
  celdas: CodigoAccion[];
  esAdministrador: boolean;
}

export function useUsuarioPermisos(usuarioId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["usuario-permisos", usuarioId],
    queryFn: () => apiFetch<PermisosUsuarioTenant>(`usuarios/${usuarioId}/permisos`),
    enabled,
    staleTime: 30_000,
  });
}

/** `PATCH /usuarios/:id/permisos` — reemplazo TOTAL del set de celdas (ADR-P10). */
export function useAsignarPermisos(usuarioId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (celdas: CodigoAccion[]) =>
      apiFetch<{ usuarioId: string; celdas: string[] }>(`usuarios/${usuarioId}/permisos`, {
        method: "PATCH",
        json: { celdas },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["usuarios"] });
      queryClient.invalidateQueries({ queryKey: ["usuario-permisos", usuarioId] });
      notifySuccess("Permisos actualizados.");
    },
    onError: notifyError,
  });
}

/**
 * `POST /usuarios/:id/permisos/aplicar-preset` — copia la plantilla del rol
 * `rolCodigo` SOBRE la matriz del usuario (ADR-P9, sobrescribe). Acción
 * independiente de `PATCH /usuarios/:id/rol` — "copiar plantilla" desde la
 * grilla, con confirmación explícita en el caller (pisa ediciones manuales).
 */
export function useAplicarPresetPermisos(usuarioId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (rolCodigo: string) =>
      apiFetch<{ usuarioId: string; rolCodigo: string }>(
        `usuarios/${usuarioId}/permisos/aplicar-preset`,
        { method: "POST", json: { rolCodigo } },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["usuarios"] });
      queryClient.invalidateQueries({ queryKey: ["usuario-permisos", usuarioId] });
      notifySuccess("Plantilla aplicada.");
    },
    onError: notifyError,
  });
}
