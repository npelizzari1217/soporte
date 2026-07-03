"use client";

/**
 * useCrearCliente — pure data mutation hook for provisioning a new client (tenant).
 *
 * POST /clientes — solo operador global (GlobalAdminGuard en backend). Provisioning
 * completo: crea la DB del tenant, corre migraciones, seedea RBAC y crea el usuario
 * admin inicial. Ver backend/src/clientes/application/use-cases/crear-cliente.use-case.ts.
 *
 * razonSocial/cuit no forman parte del formulario de PR6a (fuera de alcance del spec
 * admin-ui/Pantalla Clientes) — se envían explícitamente en null para cumplir el
 * contrato tipado del DTO backend (CreateClienteDto.razonSocial/cuit: string | null).
 *
 * dbName NO forma parte del input: el backend lo genera automáticamente a partir
 * del id del cliente ('soporte_' + uuid sin guiones) — ver change auto-dbname-cliente
 * y backend/src/clientes/application/use-cases/crear-cliente.use-case.ts.
 *
 * ADR-3 (tickets convention, reutilizado acá): UI effects (toast, cierre de modal,
 * manejo de error de formulario) viven en el caller (ClientesPage), no acá — este
 * hook es puro (mutationFn + invalidation).
 *
 * Spec: [SPEC:clientes-tenancy/POST /clientes], [SPEC:admin-ui/Pantalla Clientes]
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import { queryKeys } from "@/shared/api/query-keys";
import type { ApiError } from "@/shared/api/types";
import type { Cliente } from "../types";

/** Campos recolectados por el formulario "Nuevo cliente" (spec admin-ui/Pantalla Clientes). */
export interface CrearClienteInput {
  nombre: string;
  adminEmail: string;
  adminNombre: string;
  adminApellido: string;
  adminPassword: string;
}

export function useCrearCliente() {
  const qc = useQueryClient();
  return useMutation<Cliente, ApiError, CrearClienteInput>({
    mutationFn: (input) =>
      apiFetch<Cliente>("clientes", {
        method: "POST",
        json: { ...input, razonSocial: null, cuit: null },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.admin.clientes }),
  });
}
