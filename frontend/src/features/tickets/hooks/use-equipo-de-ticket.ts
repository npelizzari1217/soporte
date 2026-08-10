"use client";

/**
 * use-equipo-de-ticket — CONTAINER hook para `GET /soporte/:ticketId`.
 * Resuelve el equipo informático vinculado a un ticket de soporte (satélite
 * `ticket_soporte.equipoId`), para resaltarlo en el detalle del ticket.
 *
 * `enabled` lo controla el consumidor (`TicketDetailView`): solo tiene
 * sentido consultar este endpoint cuando el ticket es de tipo SOPORTE — los
 * demás tipos no tienen satélite `ticket_soporte`.
 */
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import type { EquipoDeTicketResponse } from "../types";

export function useEquipoDeTicket(ticketId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["ticket", ticketId, "equipo"],
    queryFn: () => apiFetch<EquipoDeTicketResponse>(`soporte/${ticketId}`),
    enabled: enabled && !!ticketId,
  });
}
