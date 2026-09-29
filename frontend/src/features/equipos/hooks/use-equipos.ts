"use client";

/**
 * use-equipos — CONTAINER hooks para `GET /equipos` y `GET /equipos/:id`
 * (T5.11).
 *
 * **El listado lleva gate de permiso.** `EquiposController.listar`
 * (`GET /equipos`) declara `@RequiereAcciones('EQUIPOS:LECTURA')` — no
 * alcanza con estar autenticado en el tenant, hace falta ese permiso
 * puntual. Un caller que use este hook
 * para poblar un selector opcional (ej. "Vincular equipo") tiene que asumir
 * que puede llegar un 403 y distinguirlo de "no hay equipos cargados", no
 * degradar en silencio a una lista vacía.
 */
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import type { Equipo, EquipoDetalle } from "../types";

/**
 * @param enabled Permite no pedir el listado hasta que el consumidor lo
 * necesite (ej. un diálogo cerrado) — mismo criterio que
 * `useComentariosReparacion` (`features/edilicia`). `true` por defecto:
 * los callers que ya listan equipos apenas montan siguen igual.
 */
export function useEquipos(enabled = true) {
  return useQuery({
    queryKey: ["equipos"],
    queryFn: () => apiFetch<Equipo[]>("equipos"),
    enabled,
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
