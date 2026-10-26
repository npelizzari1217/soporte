"use client";

/**
 * Mutaciones del webhook del cliente (webhooks, T7 / CA6, CA7).
 *
 * Igual que `useCrearApiClave`, el secreto en claro se separa DENTRO de
 * `mutationFn` y sale por `onSecreto`: lo que devuelve la mutación (y React
 * Query guarda como `data`) nunca lo lleva. Así vive solo en el estado del
 * componente que lo muestra, y desaparece al cerrarlo.
 *
 * Los errores con código conocido los muestra el formulario (`avisoErrorWebhook`);
 * el resto los informa `notifyError` con el mensaje del backend.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/shared/api/client";
import { ApiError } from "@/shared/api/types";
import { notifyError, notifySuccess } from "@/shared/lib/toast";
import { secretoWebhookSchema, webhookGuardadoSchema } from "../schemas";
import type { GuardarWebhookBody, WebhookConfig } from "../types";
import { WEBHOOK_QUERY_KEY } from "./use-webhook";

/** Avisos fijos por `ApiError.code`. `null` = el mensaje del backend ya es el aviso. */
const AVISO_WEBHOOK_POR_CODIGO: Record<string, string | null> = {
  API_NO_HABILITADA: "La API de este cliente no está habilitada. ROOT tiene que habilitarla para configurar el webhook.",
  WEBHOOK_EVENTOS_INVALIDOS: "Alguno de los eventos elegidos no es válido. Revise la selección.",
  WEBHOOK_URL_INVALIDA: null,
  WEBHOOK_DESTINO_NO_ADMITIDO: null,
  WEBHOOK_DESTINO_NO_ENCONTRADO: "Todavía no hay un webhook configurado. Guarde la configuración primero.",
};

/** Aviso para un error del webhook con código conocido; `undefined` si no lo es. */
export function avisoErrorWebhook(err: unknown): string | undefined {
  if (!(err instanceof ApiError) || !err.code || !(err.code in AVISO_WEBHOOK_POR_CODIGO)) return undefined;
  return AVISO_WEBHOOK_POR_CODIGO[err.code] ?? err.messages.join(" ");
}

export function useGuardarWebhook(onSecreto: (secreto: string) => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: GuardarWebhookBody): Promise<WebhookConfig> => {
      const respuesta = await apiFetch<unknown>("integraciones/webhook", { method: "PUT", json: body });
      const { secreto, ...config } = webhookGuardadoSchema.parse(respuesta);
      if (secreto) onSecreto(secreto);
      return config;
    },
    onSuccess: (config) => {
      queryClient.setQueryData(WEBHOOK_QUERY_KEY, config);
      notifySuccess("Webhook guardado.");
    },
    onError: (err) => {
      if (!avisoErrorWebhook(err)) notifyError(err);
    },
  });
}

export function useRegenerarSecretoWebhook(onSecreto: (secreto: string) => void) {
  return useMutation({
    mutationFn: async (): Promise<void> => {
      const respuesta = await apiFetch<unknown>("integraciones/webhook/secreto", { method: "POST" });
      onSecreto(secretoWebhookSchema.parse(respuesta).secreto);
    },
    onError: (err) => {
      const aviso = avisoErrorWebhook(err);
      if (aviso) toast.error(aviso);
      else notifyError(err);
    },
  });
}
