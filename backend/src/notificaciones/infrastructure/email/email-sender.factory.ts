import { IEmailSender } from '../../../shared/domain/ports/i-email-sender';
import { ILogger } from '../../../shared/domain/ports/i-logger.port';
import { SmtpEmailSender } from './smtp-email-sender';
import { NoOpEmailSender } from './noop-email-sender';

/** Subconjunto de `process.env` que necesita el factory (N1, N2). */
export interface EmailEnv {
  SMTP_HOST?: string;
  SMTP_PORT?: string;
  SMTP_USER?: string;
  SMTP_PASSWORD?: string;
  SMTP_FROM?: string;
  SMTP_SECURE?: string;
}

/**
 * resolveEmailSender — factory de degradación de IEmailSender (N2, CRÍTICO
 * beta). Si `SMTP_HOST` + `SMTP_USER` + `SMTP_PASSWORD` están presentes →
 * `SmtpEmailSender`; si falta cualquiera de los tres → `NoOpEmailSender`
 * (log-only). NUNCA lanza — no hay fail-fast en el arranque por falta de
 * config SMTP (crítico para beta local sin servidor de correo).
 *
 * `SMTP_PORT` inválido/no numérico degrada a `587` (puerto SMTP estándar con
 * STARTTLS) en vez de lanzar. `SMTP_SECURE` acepta `"true"` (SMTPS directo,
 * típicamente puerto 465); cualquier otro valor (incluido ausente) → false.
 *
 * Ref spec: sdd/premium/spec N1, N2. Ref design: ADR-P7. Tarea: N3/N4.
 */
export function resolveEmailSender(env: EmailEnv, logger: Pick<ILogger, 'log'>): IEmailSender {
  const { SMTP_HOST, SMTP_USER, SMTP_PASSWORD } = env;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASSWORD) {
    return new NoOpEmailSender(logger);
  }

  const parsedPort = Number(env.SMTP_PORT);
  const port = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 587;

  return new SmtpEmailSender(
    {
      host: SMTP_HOST,
      port,
      user: SMTP_USER,
      pass: SMTP_PASSWORD,
      from: env.SMTP_FROM ?? SMTP_USER,
      secure: env.SMTP_SECURE === 'true',
    },
    logger,
  );
}
