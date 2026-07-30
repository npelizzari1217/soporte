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
import { maskEmailLike } from '../../../shared/domain/mask-email-like';
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

/**
 * Exportado (no solo interno) para que `email-templates-build.spec.ts` pueda
 * derivar, con path math real, la ruta relativa que el script `build` debe
 * reproducir en `dist/` — en vez de comparar contra un substring hardcodeado
 * del script (Judgment Day PR2 Ronda 2, issue A).
 */
export const TEMPLATES_ROOT = path.join(__dirname, '..', 'email-templates');
const PLACEHOLDER = /{{\s*([\w.]+)\s*}}/g;

const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escapa entidades HTML (`& < > " '`) — previene XSS al interpolar texto libre del dominio (ej. `Ticket.titulo`) dentro de un email HTML. */
function escapeHtml(raw: string): string {
  return raw.replace(/[&<>"']/g, (char) => HTML_ESCAPE_MAP[char]);
}

/**
 * Interpola `{{clave}}` sobre un template.
 *
 * `escapeHtml`: `true` cuando el template se renderiza como HTML (body del
 * mail) — cada valor interpolado se escapa para que texto libre del dominio
 * (ej. `Ticket.titulo`) no pueda inyectar markup en el cliente de correo del
 * destinatario. `false` para el subject: es texto plano de header, escaparlo
 * mostraría entidades literales ("&amp;") al usuario.
 */
function interpolate(
  template: string,
  data: Record<string, unknown>,
  options: { escapeHtml: boolean } = { escapeHtml: false },
): string {
  return template.replace(PLACEHOLDER, (_match, key: string) => {
    const value = data[key];
    const stringValue = value === undefined || value === null ? '' : String(value);
    return options.escapeHtml ? escapeHtml(stringValue) : stringValue;
  });
}

function readTemplate(name: string, file: 'subject.hbs' | 'body.hbs'): string {
  return fs.readFileSync(path.join(TEMPLATES_ROOT, name, file), 'utf-8').trim();
}

/** Detecta direcciones de email embebidas en texto libre (ej. mensajes de rechazo SMTP). */
const EMAIL_IN_TEXT = /[\w.+-]+@[\w-]+\.[\w.-]+/g;

/**
 * Enmascara cualquier email en claro dentro de un texto arbitrario —
 * reusa `maskEmailLike()` (shared/domain, misma regla que `Email.mask()`).
 *
 * Los rechazos SMTP reales suelen incluir la dirección completa del
 * destinatario (ej. `550 5.1.1 <usuario@dominio.com>: Recipient address
 * rejected`). R7 exige que el email NUNCA quede en claro en errores/logs —
 * `causa` es responsabilidad del transporter, no del dominio, así que no se
 * puede confiar en que ya venga enmascarado.
 */
function sanitizeCausa(causa: string): string {
  return causa.replace(EMAIL_IN_TEXT, (match) => maskEmailLike(match));
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
      const rawCausa = err instanceof Error ? err.message : 'Error desconocido al enviar el email';
      return Result.fail(
        new EmailError(email.to.mask(), sanitizeCausa(rawCausa), 'EMAIL_SEND_FAILED'),
      );
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
      html: interpolate(bodyTemplate, body.data, { escapeHtml: true }),
    };
  }
}
