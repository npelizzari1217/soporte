/**
 * NodemailerEmailSender — implementación de EmailSenderPort sobre nodemailer.
 *
 * Provider-agnóstico desde el punto de vista de application/: cambiar de
 * nodemailer a SES (o cualquier otro proveedor SMTP/API) solo toca este
 * archivo (skill messaging-notifications, D7).
 *
 * Contrato: éxito ⇒ Result.ok(undefined); fallo del proveedor SMTP ⇒
 * Result.fail(EmailError) con el destinatario ENMASCARADO — NUNCA throw.
 *
 * Adapter PURO (runtime-config-table PR6, Dz6/Dz11/R7): `send(email, config)`
 * recibe la `SmtpConfig` YA RESUELTA y arma el transporter **por-envío** a
 * partir de esa config — SIN `constructor(transporter, from)`, SIN
 * `fromEnv()`, SIN leer `process.env`. La resolución cross-DB y el
 * descifrado del secreto viven en `configuracion/` (`IConfigResolver`),
 * consumidos por `NotificarCambioEstadoHandler` ANTES de llamar a este
 * puerto — este archivo NUNCA importa `ISecretCipher`, `PrismaService`,
 * `getMasterClient` ni `getTenantClient` (R7 escenario 2, verificado por
 * auditoría estructural en el spec). `email-config.ts`/`SmtpConfigError`
 * (fail-fast de boot) se ELIMINARON — el fail-fast se corrió a send-time
 * (spec Requirement 6): sin config resoluble, `send()` ni siquiera se
 * invoca (outcome `no-config` en el handler).
 *
 * Templating: interpolación simple `{{clave}}` sobre los .hbs de
 * `email-templates/<name>/{subject,body}.hbs` — se eligió deliberadamente
 * NO agregar la dependencia `handlebars` (open question del design.md) para
 * no ampliar la lista de deps fijada en la tarea 1.1 (PR1). Si el proyecto
 * necesita helpers/condicionales de handlebars real en el futuro, es un
 * cambio aislado a este archivo (el port no cambia).
 *
 * Ref spec: Requirement 6, Requirement 7.
 * Ref design: §5 Dz6/Dz11, §7.1.
 * Tarea: 6.3/6.4/6.5 (PR6, runtime-config-table)
 */
import * as path from 'path';
import * as fs from 'fs';
import * as nodemailer from 'nodemailer';
import { EmailSenderPort, EmailMessage } from '../../domain/ports/i-email-sender.port';
import { EmailError } from '../../domain/errors/email.errors';
import { Result } from '../../../shared/domain/result';
import { maskEmailsInText } from '../../domain/mask-email-like';
import { SmtpConfig } from '../../../shared/domain/value-objects/smtp-config.vo';

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

/** Opciones que este adapter pasa a `transportFactory` — subconjunto de
 * `SMTPTransport.Options` que se puede construir enteramente desde una
 * `SmtpConfig` ya resuelta (sin tocar `process.env`). */
export interface SmtpTransportOptions {
  host: string;
  port: number;
  secure: boolean;
  auth: { user: string; pass: string };
}

/** Factory de transporter — seam de test (evita abrir conexiones SMTP reales
 * en unit tests) e inyectable por constructor. Default: `nodemailer.createTransport`. */
export type TransportFactory = (options: SmtpTransportOptions) => EmailTransporter;

function defaultTransportFactory(options: SmtpTransportOptions): EmailTransporter {
  return nodemailer.createTransport(options);
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
 *
 * `pass` (NUEVO, PR6, design §5.1): además del masking de emails, redacta
 * cualquier ocurrencia literal del secreto SMTP en claro — defensa extra
 * (spec Requirement 2 "el secreto en claro nunca aparece fuera de memoria"):
 * un rechazo SMTP raramente incluye el password, pero no se confía en el
 * texto libre de un error de infra ajeno.
 */
function sanitizeCausa(causa: string, pass: string): string {
  const maskedEmails = maskEmailsInText(causa);
  if (pass.length === 0) return maskedEmails;
  return maskedEmails.split(pass).join('********');
}

export class NodemailerEmailSender implements EmailSenderPort {
  /** `transportFactory`: seam de test, default `nodemailer.createTransport` — SIN estado de config propio. */
  constructor(private readonly transportFactory: TransportFactory = defaultTransportFactory) {}

  /**
   * Arma el transporter POR-ENVÍO a partir de la `SmtpConfig` recibida (no
   * `process.env`, no `fromEnv()` — Dz6/Dz11, R7 escenario 1). Sin cache de
   * transporter entre envíos (R9, deuda documentada — spec §9).
   */
  async send(email: EmailMessage, config: SmtpConfig): Promise<Result<void, EmailError>> {
    try {
      const transporter = this.transportFactory({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: { user: config.user, pass: config.pass },
      });

      const { subject, text, html } = this.resolveContent(email);

      await transporter.sendMail({
        from: config.from,
        to: email.to.value(),
        subject,
        text,
        html,
      });

      return Result.ok(undefined);
    } catch (err) {
      const rawCausa = err instanceof Error ? err.message : 'Error desconocido al enviar el email';
      return Result.fail(
        new EmailError(email.to.mask(), sanitizeCausa(rawCausa, config.pass), 'EMAIL_SEND_FAILED'),
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
