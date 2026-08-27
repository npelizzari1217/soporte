/**
 * TicketNotificacionListener — adapter @OnEvent que conecta
 * `ticket.estado_cambiado`/`ticket.comentado` (Fase 2, ADR-6) con el envío de
 * email al SOLICITANTE del ticket (N3).
 *
 * Flujo por evento: carga el ticket (`TICKET_REPOSITORY`, para
 * numero/titulo/solicitanteId — el evento NO lleva PII) → resuelve el
 * contacto del solicitante (`IUsuarioContactoResolver`) → si no resuelve
 * (usuario sin email/soft-deleted) se OMITE el envío (N4, no falla el
 * resto) → arma el `EmailMessage` con la plantilla correspondiente →
 * `IEmailSender.send()`.
 *
 * ALS/TenantContext (ADR-P8): el handler corre SINCRÓNICAMENTE en el
 * call-stack de `emit()` — hereda el TenantContext del scope emisor
 * (request HTTP de TransicionarEstado/CrearComentario), por lo que
 * `TICKET_REPOSITORY.findById` ve el tenant correcto.
 *
 * Log-and-swallow total (ADR-6): un fallo en cualquier paso NUNCA se
 * propaga hacia el emisor síncrono — la transición/comentario ya committeó.
 *
 * Ref spec: sdd/premium/spec N3, N4. Ref design: ADR-P8. Tarea: N7/N8.
 */
import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ITicketRepository } from '../../../tickets/domain/ports/i-ticket.repository';
import { TicketEstadoCambiadoEvent } from '../../../tickets/domain/events/ticket-estado-cambiado.event';
import { TicketComentadoEvent } from '../../../tickets/domain/events/ticket-comentado.event';
import { IUsuarioContactoResolver } from '../../domain/ports/i-usuario-contacto-resolver';
import { IEmailSender } from '../../../shared/domain/ports/i-email-sender';
import {
  templateCambioEstado,
  templateComentarioPublico,
} from '../../domain/templates/email-templates';
import { entorno } from '../../../config/entorno';
import { ILogger } from '../../../shared/domain/ports/i-logger.port';

@Injectable()
export class TicketNotificacionListener {
  constructor(
    private readonly ticketRepo: Pick<ITicketRepository, 'findById'>,
    private readonly contactoResolver: Pick<IUsuarioContactoResolver, 'resolverContacto'>,
    private readonly emailSender: Pick<IEmailSender, 'send'>,
    private readonly logger: Pick<ILogger, 'error'>,
  ) {}

  /**
   * Maneja `ticket.estado_cambiado`: notifica por email al solicitante del
   * ticket sobre el cambio de estado (ver JSDoc de la clase para el flujo
   * completo: carga de ticket, resolución de contacto y plantilla).
   *
   * @param event Evento de cambio de estado (sin PII — solo IDs y códigos).
   * @returns No devuelve nada; si no hay ticket o no se resuelve el
   *   contacto, se omite el envío sin fallar (N4). Cualquier otro fallo se
   *   loguea y se traga (ADR-6), nunca se propaga hacia el emisor síncrono.
   */
  @OnEvent('ticket.estado_cambiado')
  async onTicketEstadoCambiado(event: TicketEstadoCambiadoEvent): Promise<void> {
    try {
      const ticket = await this.ticketRepo.findById(event.ticketId);
      if (!ticket) {
        return;
      }

      const contacto = await this.contactoResolver.resolverContacto(ticket.solicitanteId);
      if (!contacto) {
        return;
      }

      const plantilla = templateCambioEstado({
        numero: ticket.numero,
        titulo: ticket.titulo,
        ticketId: ticket.id,
        appBaseUrl: entorno.APP_BASE_URL,
        estadoAnteriorCodigo: event.estadoAnteriorCodigo,
        estadoNuevoCodigo: event.estadoNuevoCodigo,
      });

      await this.emailSender.send({ to: contacto.email, ...plantilla });
    } catch (err) {
      // log-and-swallow (ADR-6): un fallo acá nunca revierte ni afecta la
      // transición de estado ya committeada. Se loguea (no catch vacío) para
      // que el fallo quede visible sin voltear la transición.
      this.logger.error(
        `TicketNotificacionListener: fallo al notificar cambio de estado (ticketId=${event.ticketId}): ${String(err)}`,
      );
    }
  }

  /**
   * Maneja `ticket.comentado`: notifica por email al solicitante del ticket
   * sobre un comentario público nuevo (ver JSDoc de la clase para el flujo
   * completo: carga de ticket, resolución de contacto y plantilla).
   *
   * @param event Evento de comentario (sin PII — solo IDs).
   * @returns No devuelve nada; si no hay ticket o no se resuelve el
   *   contacto, se omite el envío sin fallar (N4). Cualquier otro fallo se
   *   loguea y se traga (ADR-6), nunca se propaga hacia el emisor síncrono.
   */
  @OnEvent('ticket.comentado')
  async onTicketComentado(event: TicketComentadoEvent): Promise<void> {
    try {
      const ticket = await this.ticketRepo.findById(event.ticketId);
      if (!ticket) {
        return;
      }

      const contacto = await this.contactoResolver.resolverContacto(ticket.solicitanteId);
      if (!contacto) {
        return;
      }

      const plantilla = templateComentarioPublico({
        numero: ticket.numero,
        titulo: ticket.titulo,
        ticketId: ticket.id,
        appBaseUrl: entorno.APP_BASE_URL,
      });

      await this.emailSender.send({ to: contacto.email, ...plantilla });
    } catch (err) {
      // log-and-swallow (ADR-6): un fallo acá nunca revierte ni afecta el
      // comentario ya persistido. Se loguea (no catch vacío) para que el
      // fallo quede visible sin voltear el comentario.
      this.logger.error(
        `TicketNotificacionListener: fallo al notificar comentario (ticketId=${event.ticketId}): ${String(err)}`,
      );
    }
  }
}
