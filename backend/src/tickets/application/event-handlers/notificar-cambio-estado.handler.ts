/**
 * NotificarCambioEstadoHandler — handler PURO de aplicación (sin decorators
 * NestJS) que reacciona a `TicketEstadoCambiado` filtrando por estado
 * notificable, resolviendo la config SMTP + el email del solicitante
 * cross-DB, y enviando la notificación. NUNCA lanza — todo camino de fallo
 * se modela como un `NotificacionOutcome` tipado; el framework (logging)
 * vive en el listener de infra que lo invoca
 * (`notificar-cambio-estado.listener.ts`, D2/D3).
 *
 * Paso `b` (NUEVO, PR6 runtime-config-table, Dz6/design §7.2): resuelve la
 * `SmtpConfig` vía `IConfigResolver.resolveSmtp(tenantId)` ANTES de resolver
 * el email del solicitante — si falla (sin config, config incompleta,
 * cifrado inválido), outcome `no-config` tipado y `emailSender.send()` NI
 * SIQUIERA se invoca (spec Requirement 6). El fail-fast de config SMTP se
 * corrió de boot-time a este punto (send-time).
 *
 * Ref spec: Requirement 1 (filtro), 6 (config resuelta o outcome tipado), 7
 * (adapter recibe la config ya resuelta).
 * Ref design: §5 (firma exacta), §7.2 (paso b), D2, D3, D4, Dz6.
 * Tarea: 6.8-6.10 (PR6, runtime-config-table)
 */
import { TicketEstadoCambiado } from '../../domain/events/ticket-estado-cambiado.event';
import { esEstadoNotificable } from '../../domain/policies/estados-notificables.policy';
import { ISolicitanteEmailResolver } from '../../domain/ports/i-solicitante-email.resolver';
import { EmailSenderPort } from '../../domain/ports/i-email-sender.port';
import { IConfigResolver } from '../../../configuracion/domain/ports/i-config-resolver';

export type NotificacionOutcome =
  | { status: 'skipped' }
  | { status: 'no-config'; motivo: string; codigo: string; ticketId: string }
  | { status: 'no-email'; motivo: string; solicitanteId: string; ticketId: string }
  | { status: 'send-failed'; destinatarioEnmascarado: string; causa: string; ticketId: string }
  | { status: 'sent'; destinatarioEnmascarado: string; ticketId: string };

export class NotificarCambioEstadoHandler {
  constructor(
    private readonly configResolver: IConfigResolver,
    private readonly resolver: ISolicitanteEmailResolver,
    private readonly emailSender: EmailSenderPort,
  ) {}

  /**
   * NUNCA lanza. Cualquier fallo esperado (estado no-clave, config SMTP no
   * resoluble, solicitante sin email, fallo de envío) se retorna como un
   * outcome tipado — el llamador (listener `@OnEvent`) decide qué y cómo
   * loguear.
   */
  async handle(event: TicketEstadoCambiado): Promise<NotificacionOutcome> {
    if (!esEstadoNotificable(event.estadoNuevoCodigo)) {
      return { status: 'skipped' };
    }

    const configResult = await this.configResolver.resolveSmtp(event.tenantId);
    if (configResult.isFail()) {
      return {
        status: 'no-config',
        motivo: configResult.getError().message,
        codigo: configResult.getError().code,
        ticketId: event.ticketId,
      };
    }
    const config = configResult.getValue();

    const resolved = await this.resolver.resolver(event.solicitanteId, event.tenantId);
    if (resolved.isFail()) {
      return {
        status: 'no-email',
        motivo: resolved.getError().message,
        solicitanteId: event.solicitanteId,
        ticketId: event.ticketId,
      };
    }

    const email = resolved.getValue();
    // Payload del template (PR4, task 4.14): el evento ahora carga
    // `numero`/`tituloTicket` (enriquecimiento decidido por el usuario
    // 2026-07-30) — sin volver a consultar el ticket. El filtro de
    // notificabilidad (D4) sigue siendo puro sobre `estadoNuevoCodigo`; estos
    // 2 campos son solo datos de display para el template `cambio-estado`.
    const sendResult = await this.emailSender.send(
      {
        to: email,
        subject: `Ticket actualizado: ${event.estadoNuevoCodigo}`,
        body: {
          type: 'template',
          name: 'cambio-estado',
          data: {
            ticketId: event.ticketId,
            numero: event.numero,
            tituloTicket: event.tituloTicket,
            tipoCodigo: event.tipoCodigo,
            estadoAnteriorCodigo: event.estadoAnteriorCodigo,
            estadoNuevoCodigo: event.estadoNuevoCodigo,
          },
        },
      },
      config,
    );

    if (sendResult.isFail()) {
      const error = sendResult.getError();
      return {
        status: 'send-failed',
        destinatarioEnmascarado: error.destinatarioEnmascarado,
        causa: error.causa,
        ticketId: event.ticketId,
      };
    }

    return { status: 'sent', destinatarioEnmascarado: email.mask(), ticketId: event.ticketId };
  }
}
