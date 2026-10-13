import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ILogger } from '../../shared/domain/ports/i-logger.port';
import { TenantContext } from '../../shared/tenancy/tenant-context';
import { TicketAsignadoEvent } from '../../tickets/domain/events/ticket-asignado.event';
import { TicketComentadoEvent } from '../../tickets/domain/events/ticket-comentado.event';
import { TicketCreadoEvent } from '../../tickets/domain/events/ticket-creado.event';
import { TicketEstadoCambiadoEvent } from '../../tickets/domain/events/ticket-estado-cambiado.event';
import { EncolarWebhookUseCase } from '../application/encolar-webhook.use-case';
import { EventoWebhook } from '../domain/webhook-destino';

type EventoTicket = { ticketId: string; occurredAt: Date };

/**
 * WebhookEncoladoListener — adapter `@OnEvent` que encola el aviso de webhook de los cuatro eventos
 * de ticket que el cliente puede recibir (odd/webhooks, T4, CA1). `ticket.comentado` solo se
 * publica para comentarios públicos, así que un comentario interno no genera aviso.
 * `ticket.transicionado` y `ticket.reprioritizado` no se escuchan.
 *
 * Los eventos se publican después del commit (`alCommitear`) y el handler corre en el call-stack de
 * `emit()`: hereda el `TenantContext` del emisor, de donde sale el cliente. Así el aviso del
 * cliente A se encola en la base de A, con el destino de A (criterio transversal). Si el proceso
 * se cae entre el commit y el encolado, el aviso se pierde (D2).
 *
 * Log-and-swallow: un fallo nunca se propaga hacia el emisor, la mutación ya está commiteada.
 */
@Injectable()
export class WebhookEncoladoListener {
  constructor(
    private readonly encolarWebhook: Pick<EncolarWebhookUseCase, 'ejecutar'>,
    private readonly tenantContext: Pick<TenantContext, 'get'>,
    private readonly logger: Pick<ILogger, 'error'>,
  ) {}

  @OnEvent('ticket.creado')
  async onTicketCreado(event: TicketCreadoEvent): Promise<void> {
    await this.encolar('TICKET_CREADO', event);
  }

  @OnEvent('ticket.estado_cambiado')
  async onTicketEstadoCambiado(event: TicketEstadoCambiadoEvent): Promise<void> {
    await this.encolar('TICKET_ESTADO_CAMBIADO', event);
  }

  @OnEvent('ticket.asignado')
  async onTicketAsignado(event: TicketAsignadoEvent): Promise<void> {
    await this.encolar('TICKET_ASIGNADO', event);
  }

  @OnEvent('ticket.comentado')
  async onTicketComentado(event: TicketComentadoEvent): Promise<void> {
    await this.encolar('TICKET_COMENTADO', event);
  }

  private async encolar(evento: EventoWebhook, event: EventoTicket): Promise<void> {
    try {
      const clienteId = this.tenantContext.get()?.clienteId;
      if (!clienteId) {
        this.logger.error(
          `WebhookEncoladoListener: evento ${evento} sin TenantContext, no se encola (ticketId=${event.ticketId})`,
        );
        return;
      }
      await this.encolarWebhook.ejecutar({
        clienteId,
        evento,
        ticketId: event.ticketId,
        ocurridoEn: event.occurredAt,
      });
    } catch (err) {
      // Solo el mensaje: el error crudo puede traer datos de la consulta.
      const mensaje = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `WebhookEncoladoListener: fallo al encolar ${evento} (ticketId=${event.ticketId}): ${mensaje}`,
      );
    }
  }
}
