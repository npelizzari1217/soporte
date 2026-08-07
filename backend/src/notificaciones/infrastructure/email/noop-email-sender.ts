import { EmailMessage, IEmailSender } from '../../../shared/domain/ports/i-email-sender';
import { ILogger } from '../../../shared/domain/ports/i-logger.port';
import { maskEmail } from '../../domain/util/mask-email';

/**
 * NoOpEmailSender — implementación de IEmailSender que NO envía email real:
 * loguea (enmascarado, N5) el mensaje que se habría enviado.
 *
 * Binding por defecto cuando falta configuración SMTP completa (N2, CRÍTICO
 * beta) — evita fail-fast en el arranque y deja evidencia auditable en logs
 * de que el sistema "silenciosamente" no está notificando por email.
 *
 * NUNCA loguea el cuerpo del mensaje (`text`/`html`) — solo destinatario
 * enmascarado + asunto (N5).
 *
 * Ref spec: sdd/premium/spec N1, N2, N5. Ref design: ADR-P7. Tarea: N4.
 */
export class NoOpEmailSender implements IEmailSender {
  constructor(private readonly logger: Pick<ILogger, 'log'>) {}

  async send(msg: EmailMessage): Promise<void> {
    this.logger.log(`EMAIL_NOOP | to=${maskEmail(msg.to)} | subject=${msg.subject}`);
  }
}
