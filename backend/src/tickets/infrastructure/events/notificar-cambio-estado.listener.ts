/**
 * NotificarCambioEstadoListener — adapter de entrada `@OnEvent` (infra) que
 * delega TODO el trabajo de notificación en `NotificarCambioEstadoHandler`
 * (application, puro) y decide el nivel de log según el outcome retornado
 * (D2/D3 — el repo no tiene port de logging, solo `Logger` ad-hoc de
 * `@nestjs/common`, mismo patrón que `TenantGuard`).
 *
 * Nunca expone el email en claro: el outcome del handler ya trae el
 * destinatario ENMASCARADO (`Email.mask()`) — este listener NUNCA llama
 * `.value()` sobre ningún VO Email.
 *
 * Suscripción fire-and-forget (D10): `EventEmitterPublisher.publish()` usa
 * `emitter.emit()` (no `emitAsync`), así que este handler async corre
 * desacoplado del ciclo request/response sin bloquear la respuesta HTTP.
 *
 * Ref spec: Requirement 4 (WARN, sin exponer datos sensibles), Requirement 5
 * (fallo SMTP logueado, no revierte la transición).
 * Ref design: §5, §7, D2, D3.
 * Tarea: 3.6/3.7 (PR3, notif-email-estado-ticket)
 */
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  TICKET_ESTADO_CAMBIADO,
  TicketEstadoCambiado,
} from '../../domain/events/ticket-estado-cambiado.event';
import { NotificarCambioEstadoHandler } from '../../application/event-handlers/notificar-cambio-estado.handler';

@Injectable()
export class NotificarCambioEstadoListener {
  private readonly logger = new Logger(NotificarCambioEstadoListener.name);

  constructor(private readonly handler: NotificarCambioEstadoHandler) {}

  @OnEvent(TICKET_ESTADO_CAMBIADO)
  async handleTicketEstadoCambiado(event: TicketEstadoCambiado): Promise<void> {
    const outcome = await this.handler.handle(event);

    switch (outcome.status) {
      case 'skipped':
        // Estado no-clave: comportamiento esperado, no amerita log (evita
        // ruido en la mayoría de las transiciones, que NO notifican).
        return;

      case 'no-email':
        this.logger.warn(
          `No se pudo notificar el cambio de estado del ticket "${outcome.ticketId}": ` +
            `${outcome.motivo} (solicitante "${outcome.solicitanteId}").`,
        );
        return;

      case 'send-failed':
        this.logger.error(
          `Fallo al enviar el email de notificación del ticket "${outcome.ticketId}" ` +
            `hacia "${outcome.destinatarioEnmascarado}": ${outcome.causa}. ` +
            `La transición de estado ya comiteada NO se ve afectada.`,
        );
        return;

      case 'sent':
        this.logger.log(
          `Email de notificación enviado para el ticket "${outcome.ticketId}" ` +
            `hacia "${outcome.destinatarioEnmascarado}".`,
        );
        return;
    }
  }
}
