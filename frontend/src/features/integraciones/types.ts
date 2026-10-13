/**
 * Tipos de la pantalla "Integraciones" — inferidos de los schemas Zod, que
 * espejan los DTO reales del backend (`backend/src/integraciones/`).
 */
import type { z } from "zod";
import type {
  apiClaveCreadaSchema,
  apiClaveSchema,
  crearApiClaveBodySchema,
  entregaWebhookSchema,
  entregasWebhookSchema,
  eventoWebhookSchema,
  guardarWebhookBodySchema,
  permisoApiSchema,
  webhookConfigSchema,
} from "./schemas";

export type PermisoApi = z.infer<typeof permisoApiSchema>;
export type ApiClave = z.infer<typeof apiClaveSchema>;
export type CrearApiClaveBody = z.infer<typeof crearApiClaveBodySchema>;

/** Lo que queda de la respuesta del alta una vez separada la clave en claro (que nunca se cachea). */
export type ApiClaveCreada = Omit<z.infer<typeof apiClaveCreadaSchema>, "clave">;

export type EventoWebhook = z.infer<typeof eventoWebhookSchema>;
export type GuardarWebhookBody = z.infer<typeof guardarWebhookBodySchema>;
export type EntregaWebhook = z.infer<typeof entregaWebhookSchema>;
export type EntregasWebhook = z.infer<typeof entregasWebhookSchema>;

/** La configuración tal como se cachea: nunca con el secreto en claro. */
export type WebhookConfig = z.infer<typeof webhookConfigSchema>;
