"use client";

/**
 * use-resumen-baja-equipo — `GET /equipos/:id/baja/resumen`: piezas, tickets
 * abiertos y topes de texto por categoría. Se pide al abrir el diálogo y con
 * `staleTime: 0`: el resumen es una foto del momento, nunca se reutiliza.
 */
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import { resumenBajaEquipoSchema } from "../schemas";
import type { ResumenBajaEquipo } from "../types";

export function useResumenBajaEquipo(equipoId: string, enabled: boolean) {
  return useQuery<ResumenBajaEquipo>({
    queryKey: ["equipo", equipoId, "baja-resumen"],
    queryFn: async () => resumenBajaEquipoSchema.parse(await apiFetch<unknown>(`equipos/${equipoId}/baja/resumen`)),
    enabled,
    staleTime: 0,
    gcTime: 0,
  });
}
