"use client";

/**
 * useBajaUsuario — pure data mutation hook for PATCH /usuarios/:id/baja.
 *
 * ADR-3: pure data hook — mutationFn + invalidation only. UI effects (toast,
 * dialog close) live in the caller (UsuariosPage).
 *
 * Variables: `id: string` — el usuario UUID a dar de baja.
 * Baja lógica idempotente — el backend acepta reintentos sin error.
 *
 * X-Tenant-Id SOLO se envía cuando isGlobalAdmin === true y hay un clienteId
 * seleccionado — mismo criterio de seguridad de transporte que useUsuariosAdmin.
 *
 * Spec: [SPEC:admin-ui/Pantalla Usuarios — Admin-cliente da de baja a un usuario]
 */

import { useContext } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import { useSession } from "@/shared/hooks/use-session";
import { TenantContext } from "@/shared/providers/tenant-context";
import type { ApiError } from "@/shared/api/types";

export function useBajaUsuario() {
  const qc = useQueryClient();
  const { clienteId } = useContext(TenantContext);
  const { isGlobalAdmin } = useSession();

  return useMutation<void, ApiError, string>({
    mutationFn: (id) => {
      const headers =
        isGlobalAdmin && clienteId ? { "X-Tenant-Id": clienteId } : undefined;
      return apiFetch<void>(`usuarios/${id}/baja`, { method: "PATCH", headers });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "usuarios"] }),
  });
}
