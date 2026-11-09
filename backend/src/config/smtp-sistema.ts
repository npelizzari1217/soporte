import type { SmtpConfig } from '../notificaciones/infrastructure/email/smtp-email-sender';

/**
 * Cuenta SMTP propia del sistema (odd/saturacion-conexiones, L7), para los avisos de operación
 * que no pertenecen a ningún cliente (el correo de cada cliente vive en su configuración).
 *
 * Es opcional: sin las cinco variables, devuelve `null` y quien la usa deja el aviso en el log.
 * Una configuración a medias se descarta entera, para no intentar envíos que no pueden salir.
 *
 * @param env Variables de entorno.
 * @returns La configuración, o `null` si falta alguna variable o el puerto no es un número.
 */
export function leerSmtpSistema(env: Record<string, string | undefined>): SmtpConfig | null {
  const valor = (clave: string): string | null => {
    const crudo = env[clave]?.trim();
    return crudo ? crudo : null;
  };
  const host = valor('SMTP_HOST');
  const puerto = valor('SMTP_PORT');
  const user = valor('SMTP_USER');
  const pass = valor('SMTP_PASSWORD');
  const from = valor('SMTP_FROM');
  if (!host || !puerto || !user || !pass || !from) return null;

  const port = Number(puerto);
  if (!Number.isInteger(port) || port <= 0) return null;

  return { host, port, user, pass, from, secure: valor('SMTP_SECURE') === 'true' };
}
