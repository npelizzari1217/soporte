"use client";

/**
 * useTfaCuenta — estado y acciones del 2FA propio (`/auth/2fa/**`, autenticado vía apiFetch).
 * Los códigos de recuperación se devuelven al llamador y no van a la caché de queries; el diálogo
 * resetea las mutaciones al cerrarse para descartarlos también del estado de las mutaciones.
 *
 * Spec: sdd/verificacion-dos-pasos — T7, T8, T9, T10.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import {
  codigosTfaSchema,
  confirmarSecretoTfaSchema,
  estadoTfaSchema,
  iniciarSecretoTfaSchema,
} from "../schemas";

const CLAVE = ["auth", "2fa"] as const;

export function useTfaCuenta(habilitado: boolean) {
  const qc = useQueryClient();
  const refrescar = () => qc.invalidateQueries({ queryKey: CLAVE });

  const estado = useQuery({
    queryKey: CLAVE,
    enabled: habilitado,
    queryFn: async () => estadoTfaSchema.parse(await apiFetch<unknown>("auth/2fa")),
  });
  const iniciar = useMutation({
    mutationFn: async (codigo?: string) =>
      iniciarSecretoTfaSchema.parse(
        await apiFetch<unknown>("auth/2fa/secreto/iniciar", { method: "POST", json: codigo ? { codigo } : {} }),
      ),
  });
  const confirmar = useMutation({
    mutationFn: async (codigo: string) =>
      confirmarSecretoTfaSchema.parse(
        await apiFetch<unknown>("auth/2fa/secreto/confirmar", { method: "POST", json: { codigo } }),
      ),
    onSuccess: refrescar,
  });
  const regenerar = useMutation({
    mutationFn: async (codigo: string) =>
      codigosTfaSchema.parse(await apiFetch<unknown>("auth/2fa/codigos", { method: "POST", json: { codigo } })),
    onSuccess: refrescar,
  });
  const desactivar = useMutation({
    mutationFn: (codigo: string) => apiFetch<void>("auth/2fa/desactivar", { method: "POST", json: { codigo } }),
    onSuccess: refrescar,
  });

  return { estado, iniciar, confirmar, regenerar, desactivar };
}
