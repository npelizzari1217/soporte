"use client";

/**
 * useCrearCiclo — mutación POST /ciclos.
 *
 * Crea un ciclo INACTIVO en el tenant resuelto — el backend nunca lo activa
 * automáticamente (ver ciclos.controller.ts). Invalida
 * `queryKeys.admin.ciclos(clienteId)` al completar.
 *
 * X-Tenant-Id condicional a `isGlobalAdmin && clienteId` (design ADR-3, mismo
 * gotcha de seguridad que el resto de las queries/mutaciones de ciclos).
 *
 * Errores de dominio mapeados por el backend (clientes.errors.ts):
 * - 400 BadRequestException si fechaFin <= fechaInicio.
 * - 422 UnprocessableEntityException si hay solapamiento con un ciclo activo.
 *
 * Spec: [SPEC:admin-ui/Pantalla Ciclos — Nuevo ciclo]
 */

import { useContext } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import { queryKeys } from "@/shared/api/query-keys";
import { useSession } from "@/shared/hooks/use-session";
import { TenantContext } from "@/shared/providers/tenant-context";
import type { ApiError } from "@/shared/api/types";
import type { Ciclo } from "../types";

export interface CrearCicloInput {
  nombre: string;
  fechaInicio: string;
  fechaFin: string;
}

export function useCrearCiclo() {
  const qc = useQueryClient();
  const { clienteId } = useContext(TenantContext);
  const { isGlobalAdmin } = useSession();

  return useMutation<Ciclo, ApiError, CrearCicloInput>({
    mutationFn: (input) => {
      const headers =
        isGlobalAdmin && clienteId ? { "X-Tenant-Id": clienteId } : undefined;
      return apiFetch<Ciclo>("ciclos", {
        method: "POST",
        json: input,
        headers,
      });
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: queryKeys.admin.ciclos(clienteId) }),
  });
}
