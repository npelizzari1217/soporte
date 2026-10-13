import {
  ConfiguracionWebhookDestino,
  DatosWebhookDestino,
  WebhookDestino,
} from './webhook-destino';

/**
 * Persistencia del destino de webhooks de cada cliente (master). Guarda y devuelve el secreto
 * CIFRADO: cifrar y descifrar es tarea de `SecretoWebhookCifrado`, no del repositorio.
 *
 * La configuración y el secreto se escriben por separado (JD-2, odd/webhooks T9): ninguna escritura
 * de la configuración vuelve a escribir un secreto leído antes, así que no puede deshacer una
 * regeneración ni una rotación de `EMAIL_CRYPTO_KEY` confirmadas entre la lectura y la escritura.
 */
export interface IWebhookDestinoRepository {
  /** Destino del cliente, o `null` si no tiene. Nunca devuelve el de otro cliente. */
  buscarPorCliente(clienteId: string): Promise<WebhookDestino | null>;
  /**
   * Crea el destino del cliente con su secreto. Nunca pisa uno existente: si el cliente ya tiene
   * destino (por ejemplo, otra alta concurrente ganó la carrera), no escribe nada y devuelve `null`.
   * Un resultado no nulo garantiza que el secreto guardado es el de ESTA llamada.
   */
  crear(datos: DatosWebhookDestino): Promise<WebhookDestino | null>;
  /** Cambia URL, eventos y activo sin tocar el secreto. `null` si el cliente no tiene destino. */
  actualizarConfiguracion(
    clienteId: string,
    configuracion: ConfiguracionWebhookDestino,
  ): Promise<WebhookDestino | null>;
  /** Reemplaza solo el secreto cifrado. `null` si el cliente no tiene destino. */
  actualizarSecreto(clienteId: string, secretoCifrado: string): Promise<WebhookDestino | null>;
}

export const WEBHOOK_DESTINO_REPOSITORY = Symbol('IWebhookDestinoRepository');
