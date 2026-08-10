"use client";

/**
 * use-tecnicos-asignables — CONTAINER hook para `GET /tickets/:id/asignables`.
 * Lista los TÉCNICOS elegibles para atender ESTE ticket (filtrados por el
 * módulo de su tipo, en el backend). Alimenta el combo del control unificado
 * "Asignar y poner en proceso".
 *
 * A diferencia de `useUsuariosAsignables` (universo genérico del tenant vía
 * `GET /usuarios`), esta lista ya viene acotada al ticket: no hace falta
 * filtrar en el front. El backend gatea con `ticket:asignar`.
 */
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import type { TecnicoAsignable } from "../types";

export function useTecnicosAsignables(ticketId: string, enabled = true) {
  return useQuery({
    queryKey: ["ticket", ticketId, "asignables"],
    queryFn: () => apiFetch<TecnicoAsignable[]>(`tickets/${ticketId}/asignables`),
    staleTime: 60_000,
    enabled,
  });
}
