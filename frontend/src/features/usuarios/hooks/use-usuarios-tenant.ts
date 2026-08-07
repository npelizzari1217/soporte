"use client";

/**
 * use-usuarios-tenant — CONTAINER hook para `GET /usuarios` en el contexto
 * de Admin > Usuarios (T4.7). MISMO endpoint que
 * `features/tickets/hooks/use-usuarios-asignables.ts` (selector de "Asignar
 * ticket") pero un query key DISTINTO (`["usuarios", "gestion"]` vs.
 * `["usuarios", "asignables"]`) — el shape de la respuesta puede diferir
 * (`email` solo si el actor tiene `usuario:gestionar`, backend §5) y mezclar
 * caches de ambos consumidores sería incorrecto.
 */
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import type { UsuarioTenant } from "../types";

export function useUsuariosTenant() {
  return useQuery({
    queryKey: ["usuarios", "gestion"],
    queryFn: () => apiFetch<UsuarioTenant[]>("usuarios"),
    staleTime: 30_000,
  });
}
