/**
 * email-config — lectura y validación de las variables de entorno SMTP.
 *
 * Cero config SMTP fuera de `infrastructure/` (NFR, Requirement 7 nota
 * infra): este es el ÚNICO lugar del repo que lee `process.env.SMTP_*`.
 *
 * Se invoca al construir el adapter (bootstrap de la app, vía el
 * `useFactory` de `EMAIL_SENDER` en `tickets.module.ts`), NUNCA en un
 * `send()` individual: si falta config, la app NO debe arrancar (fail-fast,
 * restaurado en Judgment Day PR3 Ronda 1 — ver STATE.md).
 *
 * Ref spec: Requirement 7 nota infra.
 * Ref design: §4, §7.
 * Tarea: 2.9/2.10 (PR2, notif-email-estado-ticket)
 */
export interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

/**
 * SmtpConfigError — error tipado que distingue "config SMTP faltante o
 * inválida" de cualquier otro bug real en `loadEmailConfig()`/`fromEnv()`.
 *
 * Mismo mensaje de cara al usuario que antes (Judgment Day PR3 Ronda 1):
 * solo se tipa el error, NO se cambia su texto ni su comportamiento
 * fail-fast (sigue siendo un `throw` que aborta el bootstrap).
 */
export class SmtpConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SmtpConfigError';
  }
}

const REQUIRED_VARS = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM'] as const;

/**
 * Lee y valida la config SMTP desde el entorno. Lanza `SmtpConfigError` si
 * falta alguna variable requerida o si `SMTP_PORT` no es numérico — este
 * throw es del tipo "irrecuperable en el límite del adapter" que aborta el
 * arranque de la app (ver EmailSenderPort JSDoc, D7). Fail-fast: NO se
 * captura en `tickets.module.ts` (Judgment Day PR3 Ronda 1).
 *
 * @param env fuente de variables de entorno (default `process.env`;
 *            parametrizado para tests deterministas sin mutar el entorno real).
 */
export function loadEmailConfig(env: NodeJS.ProcessEnv = process.env): EmailConfig {
  const missing = REQUIRED_VARS.filter((key) => !env[key]);

  if (missing.length > 0) {
    throw new SmtpConfigError(
      `Configuración SMTP incompleta. Faltan variables de entorno: ${missing.join(', ')}. ` +
        `La app no puede arrancar sin config SMTP válida (ver tickets/infrastructure/email/email-config.ts).`,
    );
  }

  const port = Number(env.SMTP_PORT);
  if (Number.isNaN(port)) {
    throw new SmtpConfigError(`SMTP_PORT debe ser numérico. Valor recibido: "${env.SMTP_PORT}".`);
  }

  return {
    host: env.SMTP_HOST as string,
    port,
    secure: env.SMTP_SECURE === 'true',
    user: env.SMTP_USER as string,
    pass: env.SMTP_PASS as string,
    from: env.SMTP_FROM as string,
  };
}
