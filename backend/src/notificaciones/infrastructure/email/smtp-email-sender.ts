import * as nodemailer from 'nodemailer';
import { EmailMessage, IEmailSender } from '../../../shared/domain/ports/i-email-sender';
import { ILogger } from '../../../shared/domain/ports/i-logger.port';
import { maskEmail } from '../../domain/util/mask-email';
import { codigoSmtpParaLog, statusSmtpParaLog } from './smtp-error';

/** Configuración de conexión SMTP (N1) — leída de env SMTP_* por el factory. */
export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  secure: boolean;
}

/**
 * SmtpEmailSender — implementación de IEmailSender sobre nodemailer (N1).
 *
 * Transport LAZY (ADR-P7): `nodemailer.createTransport()` NO abre conexión
 * al construirse — nodemailer conecta recién en el primer `sendMail()`. Esto
 * garantiza que instanciar este adapter (incluso con config inválida) nunca
 * hace fail-fast en el arranque de la app.
 *
 * `send()` envuelve el envío real en try/catch log-and-swallow (enmascarado,
 * N5, y sin el mensaje crudo del servidor: ver `smtp-error.ts`): un SMTP caído/credenciales inválidas NUNCA se propaga al caller (los
 * listeners de notificaciones, que a su vez tampoco deben propagar hacia el
 * emisor del evento de dominio).
 *
 * Ref spec: sdd/premium/spec N1, N2, N5. Ref design: ADR-P7. Tarea: N3/N4.
 */
export class SmtpEmailSender implements IEmailSender {
  private readonly transporter: nodemailer.Transporter;

  constructor(
    private readonly config: SmtpConfig,
    private readonly logger: Pick<ILogger, 'log'>,
  ) {
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.pass },
    });
  }

  async send(msg: EmailMessage): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: this.config.from,
        to: msg.to,
        subject: msg.subject,
        text: msg.text,
        html: msg.html,
      });
    } catch (error) {
      // log-and-swallow (N2): un fallo de transporte (SMTP caído, auth
      // inválida) NUNCA debe propagarse — se atrapa+loguea acá y el listener
      // que llamó a send() sigue su propio try/catch total sin ver el error.
      // Nunca el `error.message`: muchos servidores devuelven el usuario dentro
      // de la respuesta 535. Solo el code (allowlist) y el status SMTP numerico.
      this.logger.log(
        `EMAIL_SMTP_ERROR | to=${maskEmail(msg.to)} | code=${codigoSmtpParaLog(error)} | smtp=${statusSmtpParaLog(error)}`,
      );
    }
  }
}
