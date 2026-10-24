"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import type { ValoracionEquipo } from "../types";

/**
 * Clave del historial del valor de un equipo. Va aparte de `["equipo", id]` a propósito: las
 * mutaciones de componentes invalidan el detalle y no tienen por qué volver a pedir el historial.
 * La invalida `useEditarEquipo`, que es lo único que puede agregarle filas a un equipo existente.
 */
export const valoracionesEquipoKey = (equipoId: string) => ["equipo-valoraciones", equipoId] as const;

/**
 * `GET /equipos/:id/valoraciones` (`EQUIPOS:LECTURA`, odd/tasks/historial-valor-residual.md, S5):
 * el historial del valor del equipo, ordenado por fecha ascendente.
 */
export function useValoracionesEquipo(equipoId: string) {
  return useQuery({
    queryKey: valoracionesEquipoKey(equipoId),
    queryFn: () => apiFetch<ValoracionEquipo[]>(`equipos/${equipoId}/valoraciones`),
    enabled: !!equipoId,
  });
}
