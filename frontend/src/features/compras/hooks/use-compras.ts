"use client";

/**
 * use-compras — CONTAINER hooks para `GET /compras` y `GET /compras/:id`
 * (T5.1, item 1 backend-gaps). Lista PLANA sin paginación server (a
 * diferencia de `GET /tickets`) — espejo exacto de `ListarComprasUseCase`,
 * que no acepta filtros ni page/pageSize.
 */
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import type { CompraDetalle, TicketCompra } from "../types";

export function useCompras() {
  return useQuery({
    queryKey: ["compras"],
    queryFn: () => apiFetch<TicketCompra[]>("compras"),
  });
}

/** `GET /compras/:id` — `:id` = id del `Ticket` BASE. Detalle con items/presupuestos embebidos (cierra G7). */
export function useCompra(ticketId: string) {
  return useQuery({
    queryKey: ["compra", ticketId],
    queryFn: () => apiFetch<CompraDetalle>(`compras/${ticketId}`),
    enabled: !!ticketId,
  });
}
