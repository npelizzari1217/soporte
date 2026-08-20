"use client";

/**
 * use-clientes — CONTAINER hook para `GET /clientes` (G3 parcial, exclusivo
 * ROOT — `GlobalAdminGuard`). Un no-ROOT recibe 403 (`ApiError`), manejado
 * por el caller (`ClientesAdminView`), pero en la práctica la vista entera
 * está gateada por `isGlobalAdmin` ANTES de montar este hook.
 */
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import type { ClienteCorreo, ClienteListItem } from "../types";

export function useClientes(enabled = true) {
  return useQuery({
    queryKey: ["clientes"],
    queryFn: () => apiFetch<ClienteListItem[]>("clientes"),
    staleTime: 60_000,
    enabled,
  });
}

/**
 * `GET /clientes/:id/correo` — detalle de correo de UN cliente (D7): lo que
 * `ConfigurarCorreoDialog` necesita para prellenar host/puerto/usuario/
 * remitente y mostrar el estado de verificación. Se pide SOLO cuando el
 * diálogo está abierto (`enabled`) — no hay motivo para traer el detalle de
 * correo de cada fila del listado (para eso ya está el resumen embebido en
 * `GET /clientes`).
 */
export function useClienteCorreo(clienteId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["cliente-correo", clienteId],
    queryFn: () => apiFetch<ClienteCorreo>(`clientes/${clienteId}/correo`),
    enabled,
  });
}
