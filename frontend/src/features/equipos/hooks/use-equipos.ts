"use client";

/**
 * use-equipos — CONTAINER hooks para `GET /equipos` y `GET /equipos/:id`
 * (T5.11). Sin gate de permiso en el backend (a diferencia de crear/editar/
 * eliminar) — cualquier usuario autenticado del tenant puede consultar el
 * inventario (necesario para el selector de "Vincular equipo" en el form
 * de ticket de soporte).
 */
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import type { Equipo, EquipoDetalle, TipoComponente } from "../types";

export function useEquipos() {
  return useQuery({
    queryKey: ["equipos"],
    queryFn: () => apiFetch<Equipo[]>("equipos"),
  });
}

/** Detalle con `componentes` embebidos (item 1 backend-gaps — cierra G7). */
export function useEquipo(id: string) {
  return useQuery({
    queryKey: ["equipo", id],
    queryFn: () => apiFetch<EquipoDetalle>(`equipos/${id}`),
    enabled: !!id,
  });
}

export function useTiposComponente() {
  return useQuery({
    queryKey: ["equipos", "tipos-componente"],
    queryFn: () => apiFetch<TipoComponente[]>("equipos/tipos-componente"),
    staleTime: 5 * 60_000,
  });
}
