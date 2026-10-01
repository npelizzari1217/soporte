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

export interface FiltrosEquipos {
  /** Incluye los equipos dados de baja (R11). Apagado por defecto: la petición no manda el parámetro. */
  incluirBajas?: boolean;
}

/** Query string del filtro, o `undefined` si no hay que mandar nada (compartida con la exportación). */
export function queryStringEquipos({ incluirBajas }: FiltrosEquipos = {}): string | undefined {
  return incluirBajas ? "incluirBajas=true" : undefined;
}

/**
 * @param enabled Permite no pedir el listado hasta que el consumidor lo
 * necesite (ej. un diálogo cerrado) — mismo criterio que
 * `useComentariosReparacion` (`features/edilicia`). `true` por defecto:
 * los callers que ya listan equipos apenas montan siguen igual.
 * @param filtros `incluirBajas` agrega los equipos dados de baja. La clave
 * `["equipos", { incluirBajas }]` cuelga de `["equipos"]`: invalidar ese
 * prefijo refresca todas las variantes.
 */
export function useEquipos(enabled = true, filtros: FiltrosEquipos = {}) {
  const incluirBajas = filtros.incluirBajas === true;
  return useQuery({
    queryKey: ["equipos", { incluirBajas }],
    queryFn: () => {
      const qs = queryStringEquipos({ incluirBajas });
      return apiFetch<Equipo[]>(qs ? `equipos?${qs}` : "equipos");
    },
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
