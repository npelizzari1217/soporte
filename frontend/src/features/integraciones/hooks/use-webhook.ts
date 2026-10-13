"use client";

/**
 * Lecturas del webhook del cliente (webhooks, T7 / CA4): la configuración del
 * destino y el registro de entregas paginado. Solo las consume la vista de
 * administración (`<SoloAdminCliente>`); el backend re-valida con `AdminClienteGuard`.
 */
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/shared/api/client";
import { entregasWebhookSchema, webhookConfigSchema } from "../schemas";
import type { WebhookConfig } from "../types";

export const WEBHOOK_QUERY_KEY = ["webhook"] as const;
export const WEBHOOK_ENTREGAS_QUERY_KEY = ["webhook-entregas"] as const;

/** Tamaño de página del registro: el default del backend. */
export const ENTREGAS_POR_PAGINA = 20;

export function useWebhookConfig() {
  return useQuery({
    queryKey: WEBHOOK_QUERY_KEY,
    queryFn: async (): Promise<WebhookConfig> =>
      webhookConfigSchema.parse(await apiFetch<unknown>("integraciones/webhook")),
  });
}

export function useWebhookEntregas(pagina: number) {
  return useQuery({
    queryKey: [...WEBHOOK_ENTREGAS_QUERY_KEY, pagina],
    queryFn: async () =>
      entregasWebhookSchema.parse(
        await apiFetch<unknown>(`integraciones/webhook/entregas?pagina=${pagina}&porPagina=${ENTREGAS_POR_PAGINA}`),
      ),
  });
}
