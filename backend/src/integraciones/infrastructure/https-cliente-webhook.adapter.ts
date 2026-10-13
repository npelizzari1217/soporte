import type { LookupAddress } from 'node:dns';
import { request } from 'node:https';
import { isIP } from 'node:net';
import {
  IClienteHttpWebhook,
  RespuestaWebhook,
  SolicitudWebhook,
} from '../domain/cliente-http-webhook.port';

/** Bytes de la respuesta que se leen como máximo. El resto se descarta cortando la conexión. */
export const MAXIMO_BYTES_RESPUESTA_WEBHOOK = 4 * 1024;

/** Opciones de TLS extra. Solo los tests las usan, para confiar en un certificado propio. */
export interface OpcionesHttpsClienteWebhook {
  ca?: string | Buffer;
}

type CallbackLookup = (
  err: NodeJS.ErrnoException | null,
  address: string | LookupAddress[],
  family?: number,
) => void;

/**
 * `lookup` de `net.connect` que no consulta el DNS: devuelve las direcciones ya validadas por
 * `resolverDestinoSeguro`. Así no hay una segunda resolución que un DNS rebinding pueda cambiar
 * entre la validación y la conexión (odd/webhooks, nota (b) de T5). Node lo llama con `all: true`
 * cuando prueba varias familias (`autoSelectFamily`), y sin `all` en el caso clásico.
 */
function lookupFijo(direcciones: LookupAddress[]) {
  return (_hostname: string, opciones: { all?: boolean }, callback: CallbackLookup): void => {
    if (opciones.all) {
      callback(null, direcciones);
      return;
    }
    callback(null, direcciones[0].address, direcciones[0].family);
  };
}

/** Error corto para el registro: solo el código del sistema, nunca el mensaje ni el cuerpo. */
function errorCorto(err: unknown): string {
  const codigo = err instanceof Error && 'code' in err ? err.code : undefined;
  return typeof codigo === 'string' ? `error de conexión (${codigo})` : 'error de conexión';
}

/**
 * HttpsClienteWebhook — HTTP saliente de los webhooks con `node:https`, sin dependencias
 * (odd/webhooks, T5). Tres garantías:
 *
 * - **Conexión fijada.** Se conecta solo a `direcciones` (un `lookup` propio que no resuelve), y
 *   conserva el hostname real para el encabezado `Host`, el SNI y la verificación del certificado.
 * - **Sin redirecciones.** `node:https` no las sigue: un 3xx vuelve como cualquier otro código.
 * - **Acotado.** Un plazo total de `timeoutMs`, y como mucho `MAXIMO_BYTES_RESPUESTA_WEBHOOK` bytes
 *   leídos de la respuesta. El cuerpo nunca se devuelve ni se registra.
 */
export class HttpsClienteWebhook implements IClienteHttpWebhook {
  constructor(private readonly opciones: OpcionesHttpsClienteWebhook = {}) {}

  enviar(solicitud: SolicitudWebhook): Promise<RespuestaWebhook> {
    const { url, direcciones, headers, body, timeoutMs } = solicitud;
    if (direcciones.length === 0) return Promise.resolve({ error: 'sin direcciones validadas' });
    const hostname = url.hostname.replace(/^\[(.*)\]$/, '$1');

    return new Promise<RespuestaWebhook>((resolve) => {
      let terminado = false;
      const terminar = (respuesta: RespuestaWebhook): void => {
        if (terminado) return;
        terminado = true;
        clearTimeout(reloj);
        pedido.destroy();
        resolve(respuesta);
      };
      const reloj = setTimeout(() => terminar({ error: 'timeout' }), timeoutMs);

      const pedido = request(
        {
          protocol: 'https:',
          hostname,
          port: url.port || 443,
          path: `${url.pathname}${url.search}`,
          method: 'POST',
          headers: { ...headers, 'Content-Length': Buffer.byteLength(body) },
          // El SNI no admite una IP literal; con un nombre, va el nombre real.
          ...(isIP(hostname) ? {} : { servername: hostname }),
          lookup: lookupFijo(direcciones),
          // Sin agente: ningún socket reutilizado de otro destino ni de otro inquilino.
          agent: false,
          ...(this.opciones.ca ? { ca: this.opciones.ca } : {}),
        },
        (respuesta) => {
          const status = respuesta.statusCode ?? 0;
          let leidos = 0;
          respuesta.on('data', (trozo: Buffer) => {
            leidos += trozo.length;
            if (leidos >= MAXIMO_BYTES_RESPUESTA_WEBHOOK) terminar({ status });
          });
          respuesta.on('end', () => terminar({ status }));
          respuesta.on('error', () => terminar({ status }));
        },
      );

      pedido.on('error', (err) => terminar({ error: errorCorto(err) }));
      pedido.end(body);
    });
  }
}
