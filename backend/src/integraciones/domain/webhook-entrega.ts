import { EventoWebhook } from './webhook-destino';

/** Estados de una entrega de webhook (CHECK `webhook_entregas_estado_check`). */
export const ESTADOS_ENTREGA_WEBHOOK = ['PENDIENTE', 'ENTREGADA', 'FALLIDA'] as const;

export type EstadoEntregaWebhook = (typeof ESTADOS_ENTREGA_WEBHOOK)[number];

/** Largo máximo de `ultimoError` (VARCHAR de la columna): el repositorio recorta el resto. */
export const LARGO_MAXIMO_ERROR_ENTREGA = 500;

/** Cuerpo JSON del aviso, congelado al encolar. */
export type PayloadWebhook = Record<string, unknown>;

/**
 * Aviso de webhook en la base del inquilino (odd/webhooks, CA2/CA4). El `id` es el id de entrega:
 * no cambia entre reintentos, así el receptor descarta duplicados.
 */
export interface WebhookEntrega {
  id: string;
  evento: EventoWebhook;
  ticketId: string;
  payload: PayloadWebhook;
  estado: EstadoEntregaWebhook;
  intentos: number;
  proximoIntentoAt: Date;
  ultimoCodigo: number | null;
  ultimoError: string | null;
  createdAt: Date;
  entregadaAt: Date | null;
  updatedAt: Date;
}

/** Datos para encolar un aviso: nace PENDIENTE, sin intentos, vencido en `proximoIntentoAt`. */
export type DatosEncolarEntrega = Pick<
  WebhookEntrega,
  'evento' | 'ticketId' | 'payload' | 'proximoIntentoAt'
>;

/**
 * Resultado de un intento fallido. `proximoIntentoAt: null` agota los reintentos: la entrega queda
 * FALLIDA (D1). `codigo` es el HTTP recibido, si hubo respuesta.
 */
export interface FalloEntrega {
  codigo?: number | null;
  error: string;
  proximoIntentoAt: Date | null;
}

export interface PaginaEntregas {
  items: WebhookEntrega[];
  total: number;
}
