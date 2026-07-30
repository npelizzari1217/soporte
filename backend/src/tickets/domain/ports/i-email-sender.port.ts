import { Result } from '../../../shared/domain/result';
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
 * `Promise<T>` + throw. Divergencia deliberada del precedente `IFileStorage`
 * (Promise+throw): ese patrón queda como deuda, no como referencia a imitar.
 * El `throw` queda reservado para errores de infraestructura verdaderamente
 * irrecuperables en el límite del adapter (ej. config SMTP faltante al
 * bootstrap — ver email-config.ts).
 *
 * Ref spec: Requirement 7.
 * Ref design: §5, D7.
 * Tarea: 2.5 (PR2, notif-email-estado-ticket)
 */
export interface EmailSenderPort {
  send(email: EmailMessage): Promise<Result<void, EmailError>>;
}
