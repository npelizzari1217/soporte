/**
 * NodemailerEmailSender — implementación de EmailSenderPort sobre nodemailer.
 *
 * Provider-agnóstico desde el punto de vista de application/: cambiar de
 * nodemailer a SES (o cualquier otro proveedor SMTP/API) solo toca este
 * archivo (skill messaging-notifications, D7).
 *
 * Contrato: éxito ⇒ Result.ok(undefined); fallo del proveedor SMTP ⇒
 * Result.fail(EmailError) con el destinatario ENMASCARADO — NUNCA throw
 * para fallos esperados de envío (el throw queda reservado para config SMTP
 * faltante al bootstrap, ver email-config.ts).
 *
 * Templating: interpolación simple `{{clave}}` sobre los .hbs de
 * `email-templates/<name>/{subject,body}.hbs` — se eligió deliberadamente
 * NO agregar la dependencia `handlebars` (open question del design.md) para
 * no ampliar la lista de deps fijada en la tarea 1.1 (PR1). Si el proyecto
 * necesita helpers/condicionales de handlebars real en el futuro, es un
 * cambio aislado a este archivo (el port no cambia).
 *
 * Ref spec: Requirement 7.
 * Ref design: §5, §7, D7.
 * Tarea: 2.11/2.12/2.13 (PR2, notif-email-estado-ticket)
 */
import * as fs from 'fs';
import * as path from 'path';
import * as nodemailer from 'nodemailer';
import { EmailSenderPort, EmailMessage } from '../../domain/ports/i-email-sender.port';
import { EmailError } from '../../domain/errors/email.errors';
import { Result } from '../../../shared/domain/result';
import { EmailConfig, loadEmailConfig } from './email-config';

/** Subconjunto de nodemailer.Transporter que este adapter necesita — facilita el mock en tests. */
export interface EmailTransporter {
  sendMail(options: {
    from: string;
    to: string;
    subject: string;
    text?: string;
    html?: string;
  }): Promise<unknown>;
}

const TEMPLATES_ROOT = path.join(__dirname, '..', 'email-templates');
const PLACEHOLDER = /{{\s*([\w.]+)\s*}}/g;

function interpolate(template: string, data: Record<string, unknown>): string {
  return template.replace(PLACEHOLDER, (_match, key: string) => {
    const value = data[key];
    return value === undefined || value === null ? '' : String(value);
  });
}

function readTemplate(name: string, file: 'subject.hbs' | 'body.hbs'): string {
  return fs.readFileSync(path.join(TEMPLATES_ROOT, name, file), 'utf-8').trim();
}

export class NodemailerEmailSender implements EmailSenderPort {
  constructor(
    private readonly transporter: EmailTransporter,
    private readonly from: string,
  ) {}

  /**
   * Construye el adapter leyendo y validando la config SMTP del entorno
   * (lanza al bootstrap si falta — ver email-config.ts). Punto de wiring
   * real usado por el `useFactory` de EMAIL_SENDER en tickets.module.ts.
   */
  static fromEnv(env: NodeJS.ProcessEnv = process.env): NodemailerEmailSender {
    const config: EmailConfig = loadEmailConfig(env);
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.pass },
    });
    return new NodemailerEmailSender(transporter, config.from);
  }

  async send(email: EmailMessage): Promise<Result<void, EmailError>> {
    try {
      const { subject, text, html } = this.resolveContent(email);

      await this.transporter.sendMail({
        from: this.from,
        to: email.to.value(),
        subject,
        text,
        html,
      });

      return Result.ok(undefined);
    } catch (err) {
      const causa = err instanceof Error ? err.message : 'Error desconocido al enviar el email';
      return Result.fail(new EmailError(email.to.mask(), causa, 'EMAIL_SEND_FAILED'));
    }
  }

  private resolveContent(email: EmailMessage): { subject: string; text?: string; html?: string } {
    const { body } = email;

    if (body.type === 'text') {
      return { subject: email.subject, text: body.content };
    }

    if (body.type === 'html') {
      return { subject: email.subject, html: body.content };
    }

    // body.type === 'template': subject.hbs y body.hbs viven en el mismo
    // directorio (design §7) — se compilan juntos con los mismos datos.
    const subjectTemplate = readTemplate(body.name, 'subject.hbs');
    const bodyTemplate = readTemplate(body.name, 'body.hbs');

    return {
      subject: interpolate(subjectTemplate, body.data),
      html: interpolate(bodyTemplate, body.data),
    };
  }
}
