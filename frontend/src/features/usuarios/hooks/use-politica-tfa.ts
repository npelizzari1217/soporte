"use client";

/**
 * use-politica-tfa — política de verificación en dos pasos del cliente
 * (`GET/PUT /politica-2fa`, ADMINISTRADOR del cliente actual). El cliente
 * sale del JWT: nunca viaja en la request. Sin update optimista: si el PUT
 * falla, el interruptor sigue mostrando lo que el servidor tiene.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import { notifyError, notifySuccess } from "@/shared/lib/toast";
import type { PoliticaTfa } from "../types";

const KEY = ["politica-2fa"] as const;

export function usePoliticaTfa() {
  return useQuery({
    queryKey: KEY,
    queryFn: () => apiFetch<PoliticaTfa>("politica-2fa"),
  });
}

export function useCambiarPoliticaTfa() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: PoliticaTfa) => apiFetch<PoliticaTfa>("politica-2fa", { method: "PUT", json: dto }),
    onSuccess: (data) => {
      queryClient.setQueryData(KEY, data);
      notifySuccess(
        data.requiere2fa
          ? "Verificación en dos pasos exigida. Se le pedirá a cada usuario en su próximo ingreso."
          : "Ya no se exige la verificación en dos pasos.",
      );
    },
    onError: notifyError,
  });
}
