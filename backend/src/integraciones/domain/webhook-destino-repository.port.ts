import { DatosWebhookDestino, WebhookDestino } from './webhook-destino';

/**
 * Persistencia del destino de webhooks de cada cliente (master). Guarda y devuelve el secreto
 * CIFRADO: cifrar y descifrar es tarea de `SecretoWebhookCifrado`, no del repositorio.
 */
export interface IWebhookDestinoRepository {
  /** Destino del cliente, o `null` si no tiene. Nunca devuelve el de otro cliente. */
  buscarPorCliente(clienteId: string): Promise<WebhookDestino | null>;
  /** Crea el destino del cliente o reemplaza el que tenga (uno por cliente). */
  guardar(datos: DatosWebhookDestino): Promise<WebhookDestino>;
}

export const WEBHOOK_DESTINO_REPOSITORY = Symbol('IWebhookDestinoRepository');
