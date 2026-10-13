/**
 * Eventos de ticket que un cliente puede recibir por webhook (odd/webhooks, CA1). Comentado cubre
 * solo los comentarios publicos. Los eventos de SLA quedan fuera por decision de producto.
 */
export const EVENTOS_WEBHOOK = [
  'TICKET_CREADO',
  'TICKET_ESTADO_CAMBIADO',
  'TICKET_ASIGNADO',
  'TICKET_COMENTADO',
] as const;

export type EventoWebhook = (typeof EVENTOS_WEBHOOK)[number];

/** Indica si un valor cualquiera es un evento de webhook conocido. */
export function esEventoWebhook(valor: unknown): valor is EventoWebhook {
  return typeof valor === 'string' && (EVENTOS_WEBHOOK as readonly string[]).includes(valor);
}

/**
 * Destino de webhooks de un cliente: a lo sumo uno por cliente. Nunca contiene el secreto en claro,
 * solo su payload cifrado (ver `SecretoWebhookCifrado`).
 */
export interface WebhookDestino {
  clienteId: string;
  url: string;
  eventos: EventoWebhook[];
  /** Payload `v1:{iv}:{tag}:{ct}` cifrado con `EMAIL_CRYPTO_KEY` y AAD `webhook:{clienteId}`. */
  secretoCifrado: string;
  activo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Datos para crear el destino de un cliente. */
export type DatosWebhookDestino = Pick<
  WebhookDestino,
  'clienteId' | 'url' | 'eventos' | 'secretoCifrado' | 'activo'
>;

/** Lo que un ADMINISTRADOR cambia de un destino existente: todo menos el secreto. */
export type ConfiguracionWebhookDestino = Pick<WebhookDestino, 'url' | 'eventos' | 'activo'>;
