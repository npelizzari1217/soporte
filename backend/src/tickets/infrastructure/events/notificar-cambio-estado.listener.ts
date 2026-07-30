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
 * Última red de seguridad (Judgment Day PR3 Ronda 1): `handler.handle()`
 * documenta "NUNCA lanza", pero si un bug futuro en algún adapter rompiera
 * ese contrato, una promesa rechazada sin `try/catch` acá sería un unhandled
 * rejection — sin handler global de proceso, Node 24 lo trata como fatal y
 * mata el proceso. Se loguea ERROR sin exponer el email en claro y NUNCA se
 * relanza.
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
import {
  NotificarCambioEstadoHandler,
  NotificacionOutcome,
} from '../../application/event-handlers/notificar-cambio-estado.handler';
import { maskEmailsInText } from '../../domain/mask-email-like';

@Injectable()
export class NotificarCambioEstadoListener {
  private readonly logger = new Logger(NotificarCambioEstadoListener.name);

  constructor(private readonly handler: NotificarCambioEstadoHandler) {}

  @OnEvent(TICKET_ESTADO_CAMBIADO)
  async handleTicketEstadoCambiado(event: TicketEstadoCambiado): Promise<void> {
    let outcome: NotificacionOutcome;
    try {
      outcome = await this.handler.handle(event);
    } catch (err) {
      // Última red de seguridad: el handler documenta "NUNCA lanza", pero si
      // ese contrato se rompiera (bug futuro en un adapter), NO propagamos —
      // un unhandled rejection acá tira abajo el proceso (Node 24, sin
      // handler global). El handler solo debería pasar causas ya
      // enmascaradas, pero ese "debería" es justamente lo que este catch NO
      // puede confiar ciegamente (Judgment Day PR3 Ronda 2, issue 3 Juez A):
      // si un bug futuro en una capa inferior embebiera el email del
      // destinatario en el propio `Error`, quedaría en claro en el log. Se
      // enmascara el mensaje crudo con `maskEmailsInText()` antes de
      // interpolarlo (mismo patrón que `sanitizeCausa()` en
      // nodemailer-email-sender.adapter.ts: busca y enmascara SOLO
      // ocurrencias con forma de email dentro del texto libre, sin destruir
      // el resto del mensaje).
      const motivo = err instanceof Error ? maskEmailsInText(err.message) : 'Error desconocido';
      this.logger.error(
        `NotificarCambioEstadoHandler.handle() rechazó la promesa para el ticket ` +
          `"${event.ticketId}" — esto NO debería pasar (contrato "nunca throw"). ` +
          `Motivo: ${motivo}.`,
      );
      return;
    }

    switch (outcome.status) {
      case 'skipped':
        // Estado no-clave: comportamiento esperado, no amerita log (evita
        // ruido en la mayoría de las transiciones, que NO notifican).
        return;

      case 'no-config':
        // R6 (runtime-config-table PR6): config SMTP no resoluble (sin fila,
        // incompleta, o fallo de descifrado) — WARN con código+ticket, NUNCA
        // el secreto (que ni siquiera llegó a resolverse en este outcome).
        this.logger.warn(
          `No se pudo notificar el cambio de estado del ticket "${outcome.ticketId}": ` +
            `sin config SMTP resoluble (código "${outcome.codigo}"): ${outcome.motivo}.`,
        );
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

      default: {
        // Exhaustividad: si se agrega un status nuevo a NotificacionOutcome
        // sin manejarlo acá, esto rompe la compilación (tsc --noEmit) en vez
        // de fallar en silencio en runtime. Defensivo en runtime (no debería
        // ser alcanzable): loguea en vez de lanzar — el listener NUNCA
        // propaga (mismo principio que el try/catch de arriba).
        const _exhaustive: never = outcome;
        this.logger.error(`NotificacionOutcome no manejado: ${JSON.stringify(_exhaustive)}`);
        return;
      }
    }
  }
}
