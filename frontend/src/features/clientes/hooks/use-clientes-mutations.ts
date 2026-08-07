"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import { notifyError, notifySuccess } from "@/shared/lib/toast";
import type { Cliente, CreateClienteDto, UpdateClienteDto } from "../types";

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
