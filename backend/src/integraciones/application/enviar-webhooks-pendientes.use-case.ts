import type { LookupAddress } from 'node:dns';
import { IClienteRepository } from '../../clientes/domain/ports/i-cliente.repository';
import { ILogger } from '../../shared/domain/ports/i-logger.port';
import { DomainError, Result } from '../../shared/domain/result';
import { IClienteHttpWebhook } from '../domain/cliente-http-webhook.port';
import { resolverDestinoSeguro, validarUrlDestino } from '../domain/destino-webhook-seguro';
import {
  ENCABEZADO_ENTREGA_WEBHOOK,
  ENCABEZADO_EVENTO_WEBHOOK,
  ENCABEZADO_FIRMA_WEBHOOK,
  ENCABEZADO_TIMESTAMP_WEBHOOK,
  firmarWebhook,
} from '../domain/firma-webhook';
import { calcularProximoIntento } from '../domain/politica-reintentos-webhook';
import { IWebhookDestinoRepository } from '../domain/webhook-destino-repository.port';
import { IWebhookEntregaRepository } from '../domain/webhook-entrega-repository.port';
import { WebhookEntrega } from '../domain/webhook-entrega';
import { NOMBRE_EXTERNO_EVENTO_WEBHOOK } from './encolar-webhook.use-case';
import { SecretoWebhookCifrado } from './secreto-webhook-cifrado';

/** Entregas que se envían, como máximo, por inquilino y por barrido. El resto queda para el próximo. */
export const LOTE_ENVIO_WEBHOOK = 50;

/** Plazo total de cada envío: cuenta como éxito un 2xx en 10 s o menos. */
export const TIMEOUT_ENVIO_WEBHOOK_MS = 10_000;

/** Plazo de la resolución DNS del destino en cada envío (JD-3): vencido, es un intento fallido. */
export const TIMEOUT_DNS_WEBHOOK_MS = 5_000;

/** Las entregas creadas hace más de 30 días se purgan, en cualquier estado (CA9). */
export const RETENCION_ENTREGAS_WEBHOOK_MS = 30 * 24 * 60 * 60 * 1000;

export const USER_AGENT_WEBHOOK = 'Soporte-Webhooks/1';

/** Por qué el barrido no envió nada en este inquilino. Las entregas siguen PENDIENTES, intactas. */
export type MotivoPausaWebhook =
  'API_DESHABILITADA' | 'SIN_DESTINO' | 'DESTINO_INACTIVO' | 'SECRETO_INDESCIFRABLE';

/**
 * Corte anticipado del lote (JD-3): el destino no respondió con un código HTTP, así que las
 * `restantes` quedaron PENDIENTES, sin consumir intentos, para el próximo barrido.
 */
export interface CorteLoteWebhook {
  motivo: string;
  restantes: number;
}

export type ResultadoEnvioWebhooks =
  | { purgadas: number; pausado: MotivoPausaWebhook }
  | { purgadas: number; entregadas: number; fallos: number; cortado?: CorteLoteWebhook };

type Intento = { status: number } | { error: string };

/** Resolución y validación del host en cada envío; inyectable para los tests. */
export type ResolverDestino = (hostname: string) => Promise<Result<LookupAddress[], DomainError>>;

/**
 * EnviarWebhooksPendientesUseCase — un barrido de envío en el inquilino bindeado (odd/webhooks, T5:
 * CA2, CA6, CA7, CA8 y CA9). Lo corre `WebhookEnvioScheduler` una vez por inquilino.
 *
 * 1. Purga las entregas de más de 30 días (CA9), aunque el envío esté pausado.
 * 2. Pausa sin tocar las entregas si la API está deshabilitada, si no hay destino o si está
 *    inactivo (CA6): no se consume ningún intento. Lo mismo si el secreto no descifra.
 * 3. Toma hasta `LOTE_ENVIO_WEBHOOK` entregas vencidas y las envía de a una, a la URL ACTUAL del
 *    destino. Antes de cada envío vuelve a resolver el host y rechaza una IP no pública (CA8): ese
 *    rechazo cuenta como un intento fallido. Un 2xx la marca ENTREGADA; cualquier otra cosa (3xx
 *    incluido) la reprograma con `calcularProximoIntento`, o la deja FALLIDA si se agotó (D1).
 * 4. Corte anticipado (JD-3): si un envío termina sin código HTTP (timeout, error de conexión, DNS
 *    vencido o un destino rechazado al validar o resolver), ese intento se registra como fallido y
 *    el resto del lote NO se procesa en este barrido: queda PENDIENTE, con sus intentos y su próximo
 *    intento intactos. Todas esas causas dependen solo del destino, que es el mismo para todo el
 *    lote, así que el resto fallaría igual y retendría el barrido de este inquilino hasta 10 s por
 *    entrega. Un código HTTP que no es 2xx (3xx incluido) no corta: es una respuesta por entrega.
 *    La resolución DNS tiene un plazo de `TIMEOUT_DNS_WEBHOOK_MS`.
 *
 * El cuerpo enviado es exactamente `JSON.stringify(payload)`, y la firma se calcula sobre ese mismo
 * texto (CA7). Los fallos de base de datos se propagan: el scheduler los aísla por inquilino.
 */
export class EnviarWebhooksPendientesUseCase {
  constructor(
    private readonly clientes: Pick<IClienteRepository, 'findById'>,
    private readonly destinos: Pick<IWebhookDestinoRepository, 'buscarPorCliente'>,
    private readonly secretos: Pick<SecretoWebhookCifrado, 'descifrar'>,
    private readonly entregas: Pick<
      IWebhookEntregaRepository,
      'tomarVencidas' | 'marcarEntregada' | 'registrarFallo' | 'purgarAnterioresA'
    >,
    private readonly http: IClienteHttpWebhook,
    private readonly logger: Pick<ILogger, 'error' | 'log'>,
    private readonly resolver: ResolverDestino = (hostname) => resolverDestinoSeguro(hostname),
    private readonly ahora: () => Date = () => new Date(),
  ) {}

  async ejecutar(clienteId: string): Promise<ResultadoEnvioWebhooks> {
    const inicio = this.ahora();
    const purgadas = await this.entregas.purgarAnterioresA(
      new Date(inicio.getTime() - RETENCION_ENTREGAS_WEBHOOK_MS),
    );

    const cliente = await this.clientes.findById(clienteId);
    if (!cliente?.apiHabilitada) return { purgadas, pausado: 'API_DESHABILITADA' };
    const destino = await this.destinos.buscarPorCliente(clienteId);
    if (!destino) return { purgadas, pausado: 'SIN_DESTINO' };
    if (!destino.activo) return { purgadas, pausado: 'DESTINO_INACTIVO' };

    const secreto = this.secretos.descifrar(clienteId, destino.secretoCifrado);
    if (secreto.isFail()) {
      this.logger.error(
        `WEBHOOK_SWEEP_ERROR | cliente=${clienteId} | el secreto no descifra, no se envía nada`,
      );
      return { purgadas, pausado: 'SECRETO_INDESCIFRABLE' };
    }

    const vencidas = await this.entregas.tomarVencidas(inicio, LOTE_ENVIO_WEBHOOK);
    let entregadas = 0;
    let fallos = 0;
    for (const [indice, entrega] of vencidas.entries()) {
      const respuesta = await this.enviarUna(entrega, destino.url, secreto.getValue());
      if ('status' in respuesta && esExito(respuesta.status)) {
        entregadas += 1;
        continue;
      }
      fallos += 1;
      const restantes = vencidas.length - indice - 1;
      if ('error' in respuesta && restantes > 0) {
        // Sin URL ni secretos: el motivo es el error corto del adaptador o del dominio.
        this.logger.log(
          `WEBHOOK_SWEEP_CORTE | cliente=${clienteId} | motivo=${respuesta.error} | restantes=${restantes}`,
        );
        return {
          purgadas,
          entregadas,
          fallos,
          cortado: { motivo: respuesta.error, restantes },
        };
      }
    }
    return { purgadas, entregadas, fallos };
  }

  /** Envía una entrega, registra el resultado y lo devuelve. */
  private async enviarUna(entrega: WebhookEntrega, url: string, secreto: string): Promise<Intento> {
    const respuesta = await this.intentar(entrega, url, secreto);
    const ahora = this.ahora();
    if ('status' in respuesta && esExito(respuesta.status)) {
      await this.entregas.marcarEntregada(entrega.id, respuesta.status, ahora);
      return respuesta;
    }
    await this.entregas.registrarFallo(entrega.id, {
      codigo: 'status' in respuesta ? respuesta.status : null,
      error: 'status' in respuesta ? `HTTP ${respuesta.status}` : respuesta.error,
      proximoIntentoAt: calcularProximoIntento(entrega.intentos + 1, ahora),
    });
    return respuesta;
  }

  private async intentar(entrega: WebhookEntrega, url: string, secreto: string): Promise<Intento> {
    const destino = validarUrlDestino(url);
    if (destino.isFail()) return { error: destino.getError().message };
    const direcciones = await this.resolverConPlazo(destino.getValue().hostname);
    if (direcciones === null) return { error: 'timeout DNS' };
    if (direcciones.isFail()) return { error: direcciones.getError().message };

    const body = JSON.stringify(entrega.payload);
    const timestamp = Math.floor(this.ahora().getTime() / 1000);
    try {
      return await this.http.enviar({
        url: destino.getValue(),
        direcciones: direcciones.getValue(),
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': USER_AGENT_WEBHOOK,
          [ENCABEZADO_FIRMA_WEBHOOK]: firmarWebhook(secreto, timestamp, body),
          [ENCABEZADO_TIMESTAMP_WEBHOOK]: String(timestamp),
          [ENCABEZADO_EVENTO_WEBHOOK]: NOMBRE_EXTERNO_EVENTO_WEBHOOK[entrega.evento],
          [ENCABEZADO_ENTREGA_WEBHOOK]: entrega.id,
        },
        body,
        timeoutMs: TIMEOUT_ENVIO_WEBHOOK_MS,
      });
    } catch {
      // El puerto no debería lanzar; si lo hace, cuenta como un intento fallido, sin el detalle.
      return { error: 'error inesperado al enviar' };
    }
  }

  /**
   * Resuelve el host con un plazo de `TIMEOUT_DNS_WEBHOOK_MS`; `null` si venció. La consulta
   * vencida no se puede cancelar y termina sola en segundo plano; el temporizador sí se limpia.
   */
  private async resolverConPlazo(
    hostname: string,
  ): Promise<Result<LookupAddress[], DomainError> | null> {
    let reloj: ReturnType<typeof setTimeout> | undefined;
    const vencido = new Promise<null>((resolve) => {
      reloj = setTimeout(() => resolve(null), TIMEOUT_DNS_WEBHOOK_MS);
    });
    try {
      return await Promise.race([this.resolver(hostname), vencido]);
    } finally {
      clearTimeout(reloj);
    }
  }
}

function esExito(status: number): boolean {
  return status >= 200 && status < 300;
}
