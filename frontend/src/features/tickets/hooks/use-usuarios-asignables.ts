"use client";

/**
 * use-usuarios-asignables — CONTAINER hook para `GET /usuarios` (G2). Lista
 * usuarios con membresía activa en el tenant, para el selector de "Asignar
 * ticket". El backend gatea el acceso (ticket:asignar | ticket:ver_todos |
 * usuario:gestionar) — un 403 se propaga como `ApiError` normal.
 */
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import type { UsuarioAsignable } from "../types";

export function useUsuariosAsignables(enabled = true) {
  return useQuery({
    queryKey: ["usuarios", "asignables"],
    queryFn: () => apiFetch<UsuarioAsignable[]>("usuarios"),
    staleTime: 60_000,
    enabled,
  });
}
