import { IClienteRepository } from '../../clientes/domain/ports/i-cliente.repository';
import { IEstadoRepository } from '../../tickets/domain/ports/i-estado.repository';
import { ITicketRepository } from '../../tickets/domain/ports/i-ticket.repository';
import { ITipoTicketRepository } from '../../tickets/domain/ports/i-tipo-ticket.repository';
import { IWebhookDestinoRepository } from '../domain/webhook-destino-repository.port';
import { EventoWebhook } from '../domain/webhook-destino';
import { IWebhookEntregaRepository } from '../domain/webhook-entrega-repository.port';
import { WebhookEntrega } from '../domain/webhook-entrega';
import { MODULO_API_V1 } from './tipos-ticket-v1.query';

/**
 * Nombre de cada evento en el contrato externo (campo `evento` del cuerpo y encabezado
 * `X-Soporte-Evento`). Es estable: el integrador lo compara literalmente, así que no se renombra.
 */
export const NOMBRE_EXTERNO_EVENTO_WEBHOOK: Readonly<Record<EventoWebhook, string>> = {
  TICKET_CREADO: 'ticket.creado',
  TICKET_ESTADO_CAMBIADO: 'ticket.estado_cambiado',
  TICKET_ASIGNADO: 'ticket.asignado',
  TICKET_COMENTADO: 'ticket.comentado',
};

/** Resumen corto del ticket que viaja en el aviso (CA3): sin descripción ni comentarios. */
export interface TicketWebhook {
  id: string;
  numero: string;
  /** Código del estado (`NUEVO`, `ASIGNADO`, ...), el mismo de `GET /api/v1/catalogos`. */
  estado: string;
  /** Id del tipo de ticket, el mismo `tipoId` de la API `v1`. */
  tipo: string;
  creadoEn: string;
  actualizadoEn: string;
}

/** Cuerpo del aviso, congelado al encolar. */
export interface CuerpoWebhook {
  evento: string;
  ocurridoEn: string;
  ticket: TicketWebhook;
}

export interface EncolarWebhookEntrada {
  /** Cliente del inquilino bindeado: lo pone el listener desde `TenantContext`. */
  clienteId: string;
  evento: EventoWebhook;
  ticketId: string;
  ocurridoEn: Date;
}

/** Por qué no se encoló el aviso. No son errores: son los casos en que no corresponde avisar. */
export type MotivoOmisionWebhook =
  | 'API_DESHABILITADA'
  | 'SIN_DESTINO'
  | 'DESTINO_INACTIVO'
  | 'EVENTO_NO_SUSCRIPTO'
  | 'TICKET_FUERA_DE_V1';

export type ResultadoEncolarWebhook =
  { encolada: WebhookEntrega } | { omitida: MotivoOmisionWebhook };

/**
 * EncolarWebhookUseCase — encola en la base del inquilino el aviso de un evento de ticket
 * (odd/webhooks, T4: CA1, CA3, CA6 y el criterio transversal).
 *
 * Encola solo si ROOT habilitó la API del cliente (`Cliente.apiHabilitada`, CA6), si el cliente
 * tiene un destino activo y si ese destino está suscripto al evento. El ticket tiene que ser
 * visible por la API `v1` (tipo del módulo TICKETS, sin baja): el aviso no revela tickets que la
 * API no muestra. La primera entrega vence ya (`proximoIntentoAt = ahora`).
 *
 * Los fallos de infraestructura se propagan: quien escucha el evento los registra y los descarta.
 */
export class EncolarWebhookUseCase {
  constructor(
    private readonly clientes: Pick<IClienteRepository, 'findById'>,
    private readonly destinos: Pick<IWebhookDestinoRepository, 'buscarPorCliente'>,
    private readonly tickets: Pick<ITicketRepository, 'findById'>,
    private readonly estados: Pick<IEstadoRepository, 'findById'>,
    private readonly tipos: Pick<ITipoTicketRepository, 'findIdsByModulos'>,
    private readonly entregas: Pick<IWebhookEntregaRepository, 'encolar'>,
    private readonly ahora: () => Date = () => new Date(),
  ) {}

  async ejecutar(entrada: EncolarWebhookEntrada): Promise<ResultadoEncolarWebhook> {
    const cliente = await this.clientes.findById(entrada.clienteId);
    if (!cliente?.apiHabilitada) return { omitida: 'API_DESHABILITADA' };

    const destino = await this.destinos.buscarPorCliente(entrada.clienteId);
    if (!destino) return { omitida: 'SIN_DESTINO' };
    if (!destino.activo) return { omitida: 'DESTINO_INACTIVO' };
    if (!destino.eventos.includes(entrada.evento)) return { omitida: 'EVENTO_NO_SUSCRIPTO' };

    const ticket = await this.tickets.findById(entrada.ticketId);
    if (!ticket || ticket.isDeleted()) return { omitida: 'TICKET_FUERA_DE_V1' };
    const tiposV1 = await this.tipos.findIdsByModulos([MODULO_API_V1]);
    if (!tiposV1.includes(ticket.tipoId)) return { omitida: 'TICKET_FUERA_DE_V1' };

    // Estado inexistente: código vacío, el mismo criterio que la API `v1`.
    const estado = await this.estados.findById(ticket.estadoId);
    const cuerpo: CuerpoWebhook = {
      evento: NOMBRE_EXTERNO_EVENTO_WEBHOOK[entrada.evento],
      ocurridoEn: entrada.ocurridoEn.toISOString(),
      ticket: {
        id: ticket.id,
        numero: ticket.numero,
        estado: estado?.codigo ?? '',
        tipo: ticket.tipoId,
        creadoEn: ticket.createdAt.toISOString(),
        actualizadoEn: ticket.updatedAt.toISOString(),
      },
    };

    const encolada = await this.entregas.encolar({
      evento: entrada.evento,
      ticketId: ticket.id,
      payload: { ...cuerpo },
      proximoIntentoAt: this.ahora(),
    });
    return { encolada };
  }
}
