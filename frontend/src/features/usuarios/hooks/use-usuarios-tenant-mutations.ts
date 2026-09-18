"use client";

/**
 * use-usuarios-tenant-mutations — CONTAINER hooks para crear/cambiar
 * rol/desactivar membresías del tenant (T4.7). Invalida el PREFIJO
 * `["usuarios"]` (no solo `["usuarios","gestion"]`) para refrescar TAMBIÉN
 * `useUsuariosAsignables` (`["usuarios","asignables"]`, B1) — un usuario
 * nuevo o con rol cambiado debe reflejarse en el selector de "Asignar
 * ticket" sin esperar el `staleTime`.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import { notifyError, notifySuccess } from "@/shared/lib/toast";
import type {
  CambiarRolUsuarioDto,
  CreateUsuarioTenantDto,
  EditarUsuarioDto,
  ResetearPasswordUsuarioDto,
  UsuarioTenantMembresia,
} from "../types";

export function useCrearUsuarioTenant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateUsuarioTenantDto) =>
      apiFetch<UsuarioTenantMembresia>("usuarios", { method: "POST", json: dto }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["usuarios"] });
      notifySuccess("Usuario creado.");
    },
    onError: notifyError,
  });
}

export function useCambiarRolUsuarioTenant(usuarioId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CambiarRolUsuarioDto) =>
      apiFetch<{ usuarioId: string; rol: string; membresiaId: string; activo: boolean }>(
        `usuarios/${usuarioId}/rol`,
        { method: "PATCH", json: dto },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["usuarios"] });
      notifySuccess("Rol actualizado.");
    },
    onError: notifyError,
  });
}

/**
 * Edita nombre/apellido del usuario `usuarioId` (identidad global — el email
 * no se edita). Invalida el prefijo `["usuarios"]` para refrescar tanto la
 * vista admin como el selector de asignación.
 *
 * SIN toasts (ADR-3, `sdd/reset-de-contrasena-por-admin`): `EditarUsuarioDialog`
 * es el ÚNICO consumidor de este hook en todo `frontend/src`, y desde que su
 * `submit` dispara esta mutación seguida de `useResetearPasswordUsuarioTenant`
 * en una secuencia con corte, es el diálogo quien compone el mensaje final —
 * un toast verde "Usuario actualizado" emitido acá al lado de uno rojo del
 * segundo PATCH reproduciría la ambigüedad de `scripts/reset-password.ts:6-19`
 * (éxito reportado, algo debajo falló).
 */
export function useEditarUsuarioTenant(usuarioId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: EditarUsuarioDto) =>
      apiFetch<{ usuarioId: string; nombre: string; apellido: string }>(`usuarios/${usuarioId}`, {
        method: "PATCH",
        json: dto,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["usuarios"] });
    },
  });
}

/**
 * Resetea la contraseña del usuario `usuarioId` (ADR-3, ADR-4,
 * `sdd/reset-de-contrasena-por-admin`). SIN toasts, por el mismo motivo que
 * `useEditarUsuarioTenant` arriba: nace para vivir dentro de la secuencia de
 * dos mutaciones de `EditarUsuarioDialog`, que es quien decide el mensaje
 * final según cuál de las dos llamadas falló.
 *
 * `PATCH .../password` devuelve 204 sin cuerpo — de ahí `apiFetch<void>`.
 */
export function useResetearPasswordUsuarioTenant(usuarioId: string) {
  return useMutation({
    mutationFn: (dto: ResetearPasswordUsuarioDto) =>
      apiFetch<void>(`usuarios/${usuarioId}/password`, { method: "PATCH", json: dto }),
  });
}

export function useDesactivarMembresiaUsuarioTenant(usuarioId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<void>(`usuarios/${usuarioId}/membresia`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["usuarios"] });
      notifySuccess("Membresía desactivada.");
    },
    onError: notifyError,
  });
}
