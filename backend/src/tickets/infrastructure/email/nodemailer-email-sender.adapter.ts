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
import { maskEmailsInText } from '../../domain/mask-email-like';
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
 *
 * El strip de CR/LF del subject NO vive acá — se aplica de forma
 * incondicional sobre `subject` en `resolveContent()`, cubriendo las 3
 * variantes (`text`/`html`/`template`) desde un único punto (Judgment Day
 * PR2 Ronda 3, issue D — antes solo cubría el subject interpolado de
 * `template`, dejando `text`/`html` con `email.subject` sin sanitizar).
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

/**
 * Elimina `\r`/`\n` de un subject antes de que llegue a `sendMail()` — un
 * header SMTP no puede contener saltos de línea sin arriesgar header
 * injection (inyectar headers adicionales tipo `Bcc:`). Se aplica de forma
 * INCONDICIONAL en `resolveContent()` sobre las 3 variantes de body, no
 * solo sobre el subject interpolado de `template` (Judgment Day PR2
 * Ronda 3, issue D).
 */
function stripCrlf(subject: string): string {
  return subject.replace(/[\r\n]/g, '');
}

function readTemplate(name: string, file: 'subject.hbs' | 'body.hbs'): string {
  return fs.readFileSync(path.join(TEMPLATES_ROOT, name, file), 'utf-8').trim();
}

/**
 * Enmascara cualquier email en claro dentro de un texto arbitrario —
 * delega en `maskEmailsInText()` (tickets/domain), única fuente de verdad
 * del regex de detección + `maskEmailLike()` (misma regla que `Email.mask()`
 * usa para el destinatario). Antes este adapter tenía su propia copia del
 * regex `EMAIL_IN_TEXT` — consolidado en `mask-email-like.ts` para no
 * mantener dos implementaciones del mismo detector (Judgment Day PR3
 * Ronda 3, issue 1).
 *
 * Los rechazos SMTP reales suelen incluir la dirección completa del
 * destinatario (ej. `550 5.1.1 <usuario@dominio.com>: Recipient address
 * rejected`). R7 exige que el email NUNCA quede en claro en errores/logs —
 * `causa` es responsabilidad del transporter, no del dominio, así que no se
 * puede confiar en que ya venga enmascarado.
 */
function sanitizeCausa(causa: string): string {
  return maskEmailsInText(causa);
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
    let subject: string;
    let text: string | undefined;
    let html: string | undefined;

    if (body.type === 'text') {
      subject = email.subject;
      text = body.content;
    } else if (body.type === 'html') {
      subject = email.subject;
      html = body.content;
    } else {
      // body.type === 'template': subject.hbs y body.hbs viven en el mismo
      // directorio (design §7) — se compilan juntos con los mismos datos.
      const subjectTemplate = readTemplate(body.name, 'subject.hbs');
      const bodyTemplate = readTemplate(body.name, 'body.hbs');
      subject = interpolate(subjectTemplate, body.data, { escapeHtml: false });
      html = interpolate(bodyTemplate, body.data, { escapeHtml: true });
    }

    // Strip de CR/LF INCONDICIONAL — cubre las 3 variantes desde un único
    // punto antes de que el subject llegue a sendMail() (issue D).
    return { subject: stripCrlf(subject), text, html };
  }
}
