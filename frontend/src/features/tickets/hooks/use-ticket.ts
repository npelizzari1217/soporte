"use client";

/**
 * use-ticket — CONTAINER hooks para `GET /tickets/:id` y
 * `GET /tickets/:id/timeline` (R-M1 / T1.5). El timeline YA llega filtrado
 * por el backend según permiso `ticket:observar` del actor (ver
 * `TicketsController.timeline` — ninguna operación interna se envía a un
 * actor sin ese permiso). El front no re-filtra: solo renderiza lo que le
 * llega.
 */
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import type { OperacionTicket, Ticket } from "../types";

export function useTicket(id: string) {
  return useQuery({
    queryKey: ["ticket", id],
    queryFn: () => apiFetch<Ticket>(`tickets/${id}`),
    enabled: !!id,
  });
}

export function useTicketTimeline(id: string) {
  return useQuery({
    queryKey: ["ticket", id, "timeline"],
    queryFn: () => apiFetch<OperacionTicket[]>(`tickets/${id}/timeline`),
    enabled: !!id,
  });
}
