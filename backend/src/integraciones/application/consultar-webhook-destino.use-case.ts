import { IWebhookDestinoRepository } from '../domain/webhook-destino-repository.port';
import { EventoWebhook, WebhookDestino } from '../domain/webhook-destino';

/**
 * Configuración del destino de webhooks tal como la ve el ADMINISTRADOR (odd/webhooks, T6). Sigue
 * la convención de `GET /clientes/:id/correo`: sin destino, `configurado: false` y el resto en
 * `null`. Nunca lleva el secreto, ni en claro ni cifrado.
 */
export interface WebhookDestinoVista {
  configurado: boolean;
  url: string | null;
  eventos: EventoWebhook[] | null;
  activo: boolean | null;
  creadoEn: Date | null;
  actualizadoEn: Date | null;
}

export const WEBHOOK_DESTINO_SIN_CONFIGURAR: WebhookDestinoVista = {
  configurado: false,
  url: null,
  eventos: null,
  activo: null,
  creadoEn: null,
  actualizadoEn: null,
};

/** Proyecta el destino a su vista pública: deja afuera `secretoCifrado` y `clienteId`. */
export function vistaWebhookDestino(destino: WebhookDestino | null): WebhookDestinoVista {
  if (!destino) return { ...WEBHOOK_DESTINO_SIN_CONFIGURAR };
  return {
    configurado: true,
    url: destino.url,
    eventos: [...destino.eventos],
    activo: destino.activo,
    creadoEn: destino.createdAt,
    actualizadoEn: destino.updatedAt,
  };
}

/** ConsultarWebhookDestinoUseCase — el destino del cliente del actor, sin el secreto. */
export class ConsultarWebhookDestinoUseCase {
  constructor(private readonly destinos: Pick<IWebhookDestinoRepository, 'buscarPorCliente'>) {}

  async execute(clienteId: string): Promise<WebhookDestinoVista> {
    return vistaWebhookDestino(await this.destinos.buscarPorCliente(clienteId));
  }
}
