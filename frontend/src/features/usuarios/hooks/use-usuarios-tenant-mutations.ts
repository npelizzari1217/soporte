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
      notifySuccess("Usuario actualizado.");
    },
    onError: notifyError,
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
