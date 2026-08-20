"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import { notifyError, notifySuccess } from "@/shared/lib/toast";
import type { Cliente, ClienteCorreo, ConfigurarCorreoDto, CreateClienteDto, UpdateClienteDto } from "../types";

export function useCrearCliente() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateClienteDto) => apiFetch<Cliente>("clientes", { method: "POST", json: dto }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clientes"] });
      notifySuccess("Cliente creado.");
    },
    onError: notifyError,
  });
}

/** Edita datos comerciales de un cliente (`PATCH /clientes/:id`). Solo ROOT. */
export function useEditarCliente() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateClienteDto }) =>
      apiFetch<Cliente>(`clientes/${id}`, { method: "PATCH", json: dto }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clientes"] });
      notifySuccess("Cliente actualizado.");
    },
    onError: notifyError,
  });
}

/** Baja lógica de un cliente (`PATCH /clientes/:id/desactivar`). La DB física NO se elimina. Solo ROOT. */
export function useDesactivarCliente() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<Cliente>(`clientes/${id}/desactivar`, { method: "PATCH" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clientes"] });
      notifySuccess("Cliente desactivado.");
    },
    onError: notifyError,
  });
}

/** Revierte la baja lógica de un cliente (`PATCH /clientes/:id/activar`). Solo ROOT. */
export function useActivarCliente() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<Cliente>(`clientes/${id}/activar`, { method: "PATCH" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clientes"] });
      notifySuccess("Cliente activado.");
    },
    onError: notifyError,
  });
}

/**
 * Configura (alta o edición) el correo SMTP de un cliente
 * (`PATCH /clientes/:id/correo`, D7). Solo ROOT. Invalida tanto el detalle
 * de correo (`["cliente-correo", id]`) como el listado (`["clientes"]`,
 * que trae el resumen `correo.configurado` usado en la tabla).
 */
export function useConfigurarCorreoCliente(clienteId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: ConfigurarCorreoDto) =>
      apiFetch<ClienteCorreo>(`clientes/${clienteId}/correo`, { method: "PATCH", json: dto }),
    onSuccess: (data) => {
      queryClient.setQueryData(["cliente-correo", clienteId], data);
      queryClient.invalidateQueries({ queryKey: ["clientes"] });
      notifySuccess("Configuración de correo guardada.");
    },
    onError: notifyError,
  });
}

/**
 * Quita la configuración de correo de un cliente (`DELETE /clientes/:id/correo`,
 * D7). Acción EXPLÍCITA y separada de guardar — vaciar el campo de
 * contraseña en el form NUNCA dispara esto. Solo ROOT.
 */
export function useQuitarCorreoCliente(clienteId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<ClienteCorreo>(`clientes/${clienteId}/correo`, { method: "DELETE" }),
    onSuccess: (data) => {
      queryClient.setQueryData(["cliente-correo", clienteId], data);
      queryClient.invalidateQueries({ queryKey: ["clientes"] });
      notifySuccess("Configuración de correo eliminada.");
    },
    onError: notifyError,
  });
}

/**
 * Prueba la conexión SMTP con la config YA guardada
 * (`POST /clientes/:id/correo/probar`, D6/D7) — no la modifica, solo
 * persiste y devuelve el resultado saneado del handshake. Solo ROOT.
 */
export function useProbarCorreoCliente(clienteId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<ClienteCorreo>(`clientes/${clienteId}/correo/probar`, { method: "POST" }),
    onSuccess: (data) => {
      queryClient.setQueryData(["cliente-correo", clienteId], data);
      queryClient.invalidateQueries({ queryKey: ["clientes"] });
      notifySuccess("Prueba de conexión ejecutada.");
    },
    onError: notifyError,
  });
}
