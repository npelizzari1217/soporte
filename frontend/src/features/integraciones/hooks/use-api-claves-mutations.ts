"use client";

/**
 * Mutaciones de claves de la API pública (api-publica, T9 / CA4, CA9).
 *
 * `useCrearApiClave` separa la clave en claro DENTRO de `mutationFn` y se la
 * entrega a `onClaveCreada`: lo que devuelve la mutación (y por lo tanto lo que
 * React Query guarda en `MutationCache` como `data`) es la respuesta SIN
 * `clave`. Así la clave vive solo en el estado del componente que la muestra,
 * y desaparece al cerrarlo. Un 422 (API deshabilitada, nombre o permisos
 * inválidos) llega como `ApiError` y `notifyError` muestra el mensaje del backend.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import { notifyError, notifySuccess } from "@/shared/lib/toast";
import { apiClaveCreadaSchema } from "../schemas";
import type { ApiClaveCreada, CrearApiClaveBody } from "../types";
import { API_CLAVES_QUERY_KEY } from "./use-api-claves";

export function useCrearApiClave(onClaveCreada: (clave: string) => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: CrearApiClaveBody): Promise<ApiClaveCreada> => {
      const respuesta = await apiFetch<unknown>("integraciones/claves", { method: "POST", json: body });
      const { clave, ...creada } = apiClaveCreadaSchema.parse(respuesta);
      onClaveCreada(clave);
      return creada;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: API_CLAVES_QUERY_KEY });
    },
    onError: notifyError,
  });
}

export function useRevocarApiClave() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`integraciones/claves/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: API_CLAVES_QUERY_KEY });
      notifySuccess("Clave revocada.");
    },
    onError: notifyError,
  });
}
