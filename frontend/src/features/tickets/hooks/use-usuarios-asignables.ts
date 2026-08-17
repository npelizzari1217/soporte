"use client";

/**
 * use-usuarios-asignables — CONTAINER hook para `GET /usuarios` (G2). Lista
 * usuarios con membresía activa en el tenant, para el selector de "Asignar
 * ticket". El backend gatea el acceso (`TICKETS:ASIGNAR` | `TICKETS:VER_TODOS`
 * | ADMINISTRADOR-o-ROOT, R4-excepción) — un 403 se propaga como `ApiError`
 * normal. `email` viaja AUSENTE (no `null`) salvo que el actor sea
 * ADMINISTRADOR/ROOT (R10) — `UsuarioAsignable.email` ya es opcional.
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
