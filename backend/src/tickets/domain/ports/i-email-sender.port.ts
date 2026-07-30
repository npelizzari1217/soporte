import { Result } from '../../../shared/domain/result';
import { SmtpConfig } from '../../../shared/domain/value-objects/smtp-config.vo';
import { Email } from '../value-objects/email.vo';
import { EmailError } from '../errors/email.errors';

/** Token de inyección de dependencias para EmailSenderPort en NestJS. */
export const EMAIL_SENDER = Symbol('EMAIL_SENDER');

/**
 * EmailBody — variantes de contenido soportadas por EmailSenderPort.
 *
 * El tipo `template` referencia un template por nombre (resuelto en
 * infrastructure/email-templates/) + los datos para interpolarlo — la capa
 * de aplicación NUNCA construye HTML directamente (regla clean-arch:
 * templates viven en infra).
 */
export type EmailBody =
  | { type: 'text'; content: string }
  /**
   * `html`: `content` se envía TAL CUAL, sin escapar, al cliente de correo
   * del destinatario. ASUME contenido ya confiable/estático (ej. un string
   * literal armado por infra) — la capa de aplicación NUNCA debe alimentar
   * esta variante con datos de dominio sin sanitizar (título de ticket,
   * observaciones, cualquier input de usuario), o reintroduce el riesgo XSS
   * que `type: 'template'` sí mitiga vía `escapeHtml` en la interpolación
   * (ver `nodemailer-email-sender.adapter.ts`). Hoy no hay ningún caller de
   * producción para esta variante (Judgment Day PR2 Ronda 2, issue E).
   */
  | { type: 'html'; content: string }
  | { type: 'template'; name: string; data: Record<string, unknown> };

export interface EmailMessage {
  to: Email;
  subject: string;
  body: EmailBody;
}

/**
 * EmailSenderPort — única forma en que la capa de aplicación envía emails.
 *
 * Contrato `Result<void, EmailError>` (D7, skill error-handling) — NUNCA
 * `Promise<T>` + throw.
 *
 * `send(email, config)` (EDITADO — runtime-config-table PR6, Dz6/R7): recibe
 * la `SmtpConfig` YA RESUELTA y descifrada como parámetro explícito — el
 * adapter (`NodemailerEmailSender`) es PURO: arma el transporter por-envío a
 * partir de `config`, NUNCA resuelve config cross-DB ni invoca
 * `ISecretCipher`. La resolución (tenant→global, descifrado) vive en
 * `application`/`configuracion` (`IConfigResolver`), ANTES de llamar a
 * `send()`. El fail-fast de config SMTP faltante/inválida se corrió de
 * boot-time (antes: `email-config.ts`, eliminado) a send-time — un envío sin
 * config resoluble nunca llega a invocar este puerto (outcome `no-config` en
 * `NotificarCambioEstadoHandler`, spec Requirement 6).
 *
 * Ref spec: Requirement 6, Requirement 7.
 * Ref design: §5 Dz6, §7.1/§7.2.
 * Tarea: 6.1/6.2 (PR6, runtime-config-table)
 */
export interface EmailSenderPort {
  send(email: EmailMessage, config: SmtpConfig): Promise<Result<void, EmailError>>;
}
