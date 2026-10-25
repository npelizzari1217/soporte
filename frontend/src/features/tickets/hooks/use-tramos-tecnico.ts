"use client";

/**
 * use-tramos-tecnico — CONTAINER hook de `GET /tickets/:id/tramos-tecnico`
 * (odd/tasks/tiempo-tecnico.md, T4): el tiempo de cada técnico en el ticket
 * contra la meta del SLA. El backend lo da a quien ve el ticket; a cualquier
 * otro, 404.
 *
 * El query key cuelga de `["ticket", id]`: asignar, transicionar o resolver
 * invalidan ese prefijo, y el tramo que esas mutaciones abren o cierran se
 * refresca solo.
 */
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import type { TramoTecnico } from "../types";

export const tramosTecnicoKey = (ticketId: string) => ["ticket", ticketId, "tramos-tecnico"] as const;

export function useTramosTecnico(ticketId: string) {
  return useQuery({
    queryKey: tramosTecnicoKey(ticketId),
    queryFn: () => apiFetch<TramoTecnico[]>(`tickets/${ticketId}/tramos-tecnico`),
    enabled: !!ticketId,
  });
}
