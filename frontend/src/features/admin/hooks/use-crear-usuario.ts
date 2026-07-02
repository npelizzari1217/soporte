"use client";

/**
 * useCrearUsuario — pure data mutation hook for creating a usuario (POST /usuarios).
 *
 * ADR-3 (mismo patrón que useCreateTicket): pure data (mutationFn + invalidation
 * only). UI effects (toast, modal close, form reset, setError) live in the
 * caller (UsuariosPage), no acá.
 *
 * X-Tenant-Id SOLO se envía cuando isGlobalAdmin === true y hay un clienteId
 * seleccionado — mismo criterio de seguridad de transporte que useUsuariosAdmin.
 *
 * Invalida el prefijo ["admin", "usuarios"] (todas las variantes de clienteId)
 * para que la lista se refresque con el usuario recién creado.
 *
 * Spec: [SPEC:admin-ui/Pantalla Usuarios — Admin-cliente crea un nuevo usuario]
 */

import { useContext } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import { useSession } from "@/shared/hooks/use-session";
import { TenantContext } from "@/shared/providers/tenant-context";
import type { ApiError } from "@/shared/api/types";
import type { Usuario, NuevoUsuarioInput } from "../types";

export function useCrearUsuario() {
  const qc = useQueryClient();
  const { clienteId } = useContext(TenantContext);
  const { isGlobalAdmin } = useSession();

  return useMutation<Usuario, ApiError, NuevoUsuarioInput>({
    mutationFn: (dto) => {
      const headers =
        isGlobalAdmin && clienteId ? { "X-Tenant-Id": clienteId } : undefined;
      return apiFetch<Usuario>("usuarios", { method: "POST", json: dto, headers });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "usuarios"] }),
  });
}
