"use client";

/**
 * useCrearRoot — pure data mutation hook for creating a usuario root (POST /usuarios/root).
 *
 * ADR-3 (mismo patrón que useCreateTicket/useCrearUsuario): pure data
 * (mutationFn + invalidation only). UI effects (toast, modal close, form
 * reset, setError) viven en el caller (UsuariosPage), no acá.
 *
 * X-Tenant-Id: NO se pasa header explícito — lo inyecta el holder
 * centralizado (Dz5, shared/api/tenant-header.ts) vía el efecto puente de
 * `TenantContextProvider`. Ver design.md §2.12.
 *
 * Invalida el prefijo ["admin", "usuarios"] (todas las variantes de clienteId)
 * para que la lista se refresque con el root recién creado.
 *
 * Spec: [SPEC:admin-ui/R6 Creación de root visible solo para roots en la UI]
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import type { ApiError } from "@/shared/api/types";
import type { Usuario, NuevoRootInput } from "../types";

export function useCrearRoot() {
  const qc = useQueryClient();

  return useMutation<Usuario, ApiError, NuevoRootInput>({
    mutationFn: (dto) => apiFetch<Usuario>("usuarios/root", { method: "POST", json: dto }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "usuarios"] }),
  });
}
