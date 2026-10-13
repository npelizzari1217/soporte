import type { LookupAddress } from 'node:dns';

/** Pedido de envío de un aviso de webhook (odd/webhooks, T5). */
export interface SolicitudWebhook {
  /** URL del destino, ya validada con `validarUrlDestino`. */
  url: URL;
  /**
   * Direcciones ya validadas por `resolverDestinoSeguro`. El adaptador se conecta solo a estas y no
   * vuelve a resolver el host: así el DNS no puede cambiar entre la validación y la conexión.
   */
  direcciones: LookupAddress[];
  headers: Record<string, string>;
  body: string;
  /** Plazo total del envío, de la conexión al último byte leído. */
  timeoutMs: number;
}

/**
 * Resultado de un envío: el código HTTP recibido (cualquiera, incluido un 3xx, que no se sigue) o un
 * error corto sin secretos ni cuerpo de respuesta (timeout, conexión rechazada, TLS, ...).
 */
export type RespuestaWebhook = { status: number } | { error: string };

/** HTTP saliente de los webhooks. Nunca lanza: todo fallo vuelve como `{ error }`. */
export interface IClienteHttpWebhook {
  enviar(solicitud: SolicitudWebhook): Promise<RespuestaWebhook>;
}

export const CLIENTE_HTTP_WEBHOOK = Symbol('IClienteHttpWebhook');
