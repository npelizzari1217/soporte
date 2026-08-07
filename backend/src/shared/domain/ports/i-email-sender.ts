/**
 * EmailMessage — mensaje de email listo para enviar (asunto + cuerpo ya
 * renderizados por una plantilla, N6). Sin adjuntos en beta.
 */
export interface EmailMessage {
  /** Dirección de email del destinatario. */
  readonly to: string;
  /** Asunto del email. */
  readonly subject: string;
  /** Cuerpo en texto plano (siempre presente — fallback de `html`). */
  readonly text: string;
  /** Cuerpo en HTML (opcional). */
  readonly html?: string;
}

/**
 * IEmailSender — puerto de envío de email (N1, ADR-P7).
 *
 * Fire-and-forget desde la perspectiva del caller: las implementaciones
 * concretas (`SmtpEmailSender`, `NoOpEmailSender`) NUNCA deben lanzar — un
 * fallo de transporte se atrapa y loguea (enmascarado, N5) dentro del propio
 * adapter. `send()` retorna `Promise<void>` únicamente para permitir awaitear
 * la finalización del intento, no para propagar errores al caller.
 *
 * Ref spec: sdd/premium/spec N1, N2. Ref design: ADR-P7.
 */
export interface IEmailSender {
  send(msg: EmailMessage): Promise<void>;
}

/** Token de inyección de dependencias para IEmailSender en NestJS. */
export const EMAIL_SENDER = Symbol('EMAIL_SENDER');
