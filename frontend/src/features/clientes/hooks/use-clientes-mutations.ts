"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import { notifyError, notifySuccess } from "@/shared/lib/toast";
import type { Cliente, CreateClienteDto } from "../types";

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
