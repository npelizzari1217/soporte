"use client";

/**
 * use-clientes — CONTAINER hook para `GET /clientes` (G3 parcial, exclusivo
 * ROOT — `GlobalAdminGuard`). Un no-ROOT recibe 403 (`ApiError`), manejado
 * por el caller (`ClientesAdminView`), pero en la práctica la vista entera
 * está gateada por `isGlobalAdmin` ANTES de montar este hook.
 */
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import type { Cliente } from "../types";

export function useClientes(enabled = true) {
  return useQuery({
    queryKey: ["clientes"],
    queryFn: () => apiFetch<Cliente[]>("clientes"),
    staleTime: 60_000,
    enabled,
  });
}
