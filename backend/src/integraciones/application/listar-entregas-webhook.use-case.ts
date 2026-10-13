import { IWebhookEntregaRepository } from '../domain/webhook-entrega-repository.port';
import { EstadoEntregaWebhook, WebhookEntrega } from '../domain/webhook-entrega';
import { NOMBRE_EXTERNO_EVENTO_WEBHOOK } from './encolar-webhook.use-case';

/** Tope de `porPagina` del registro de entregas. */
export const MAXIMO_POR_PAGINA_ENTREGAS_WEBHOOK = 100;
export const POR_PAGINA_ENTREGAS_WEBHOOK = 20;

/** Una fila del registro de entregas (odd/webhooks, CA4). Sin el cuerpo del aviso. */
export interface EntregaWebhookVista {
  id: string;
  /** Nombre externo del evento, el mismo que viaja en el aviso (`ticket.creado`, ...). */
  evento: string;
  ticketId: string;
  /** Número del ticket tomado del cuerpo congelado; `null` si el cuerpo no lo trae. */
  numero: number | null;
  estado: EstadoEntregaWebhook;
  intentos: number;
  ultimoCodigo: number | null;
  ultimoError: string | null;
  createdAt: Date;
  proximoIntentoAt: Date;
  entregadaAt: Date | null;
}

export interface PaginaEntregasWebhookVista {
  items: EntregaWebhookVista[];
  total: number;
  pagina: number;
  porPagina: number;
}

/** El número del ticket del cuerpo `{ ticket: { numero } }` que arma `EncolarWebhookUseCase`. */
function numeroDelPayload(payload: Record<string, unknown>): number | null {
  const ticket = payload.ticket;
  if (typeof ticket !== 'object' || ticket === null) return null;
  const numero: unknown = Reflect.get(ticket, 'numero');
  return typeof numero === 'number' ? numero : null;
}

function vista(entrega: WebhookEntrega): EntregaWebhookVista {
  return {
    id: entrega.id,
    evento: NOMBRE_EXTERNO_EVENTO_WEBHOOK[entrega.evento],
    ticketId: entrega.ticketId,
    numero: numeroDelPayload(entrega.payload),
    estado: entrega.estado,
    intentos: entrega.intentos,
    ultimoCodigo: entrega.ultimoCodigo,
    ultimoError: entrega.ultimoError,
    createdAt: entrega.createdAt,
    proximoIntentoAt: entrega.proximoIntentoAt,
    entregadaAt: entrega.entregadaAt,
  };
}

/**
 * ListarEntregasWebhookUseCase — página del registro de entregas del inquilino bindeado, la más
 * nueva primero (odd/webhooks, T6, CA4). El aislamiento lo da el repositorio, que lee la base del
 * `TenantContext`. `pagina` y `porPagina` se acotan acá aunque el DTO ya los valide.
 */
export class ListarEntregasWebhookUseCase {
  constructor(private readonly entregas: Pick<IWebhookEntregaRepository, 'listar'>) {}

  async execute(opciones: {
    pagina?: number;
    porPagina?: number;
  }): Promise<PaginaEntregasWebhookVista> {
    const pagina = Math.max(Math.trunc(opciones.pagina ?? 1), 1);
    const porPagina = Math.min(
      Math.max(Math.trunc(opciones.porPagina ?? POR_PAGINA_ENTREGAS_WEBHOOK), 1),
      MAXIMO_POR_PAGINA_ENTREGAS_WEBHOOK,
    );
    const { items, total } = await this.entregas.listar({ pagina, porPagina });
    return { items: items.map(vista), total, pagina, porPagina };
  }
}
