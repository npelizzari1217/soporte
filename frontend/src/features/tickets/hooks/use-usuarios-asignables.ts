"use client";

/**
 * use-usuarios-asignables — CONTAINER hook para `GET /usuarios` (G2). Lista
 * usuarios con membresía activa en el tenant, de cualquier rol y tipo: no sirve
 * para ofrecer responsables. Los selectores de responsable usan listas ya acotadas
 * por el backend (`GET /tickets/:id/asignables`, `GET /tickets/agentes`,
 * `GET /preventivo/planes/responsables`). El backend gatea el acceso (`ASIGNAR` | `VER_TODOS` sobre algún tipo
 * de ticket | ADMINISTRADOR-o-ROOT, R4-excepción; odd/permisos-por-tipo-ticket
 * T6) — un 403 se propaga como `ApiError` normal. `email` viaja AUSENTE (no `null`) salvo que el actor sea
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
