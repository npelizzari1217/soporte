import { EmailMessage } from '../../../shared/domain/ports/i-email-sender';
import { escaparHtml } from '../../../shared/domain/escapar-html';

/** Cuerpo de una plantilla renderizada: subject/text/html (sin `to`). */
type PlantillaEmail = Omit<EmailMessage, 'to'>;

/** Datos de la plantilla del mail de solicitud de reseteo. */
interface DatosResetPassword {
  nombre: string;
  /** Token CRUDO (no el hash) — va en el link, nunca se persiste. */
  token: string;
  /** `APP_BASE_URL`, inyectada por el caller (infra). NUNCA el header `Host`. */
  appBaseUrl: string;
  vigenciaMinutos: number;
}

/** Datos de la plantilla del mail de confirmación de reseteo. */
interface DatosResetConfirmado {
  nombre: string;
}

/**
 * templateResetPassword — plantilla del mail de solicitud de reseteo. Función
 * pura, sin I/O. El link pone el token en el FRAGMENTO (`#`): nunca viaja al
 * servidor, así que no queda en access logs ni en el `Referer` (ADR-7).
 *
 * Ref spec: sdd/auth-reseteo-por-olvido/spec, Requirement "El link de reset
 * se construye solo desde APP_BASE_URL". Ref design: ADR-7. Tarea: 3.2.
 */
export function templateResetPassword(datos: DatosResetPassword): PlantillaEmail {
  const link = `${datos.appBaseUrl}/restablecer-password#token=${datos.token}`;
  const subject = 'Restablecé tu contraseña';
  const text =
    `Hola ${datos.nombre},\n\n` +
    `Pediste restablecer tu contraseña. Este link vence en ${datos.vigenciaMinutos} minutos:\n\n` +
    `${link}\n\n` +
    `Si no fuiste vos, ignorá este mail: tu contraseña sigue siendo la misma.`;
  const html =
    `<p>Hola ${escaparHtml(datos.nombre)},</p>` +
    `<p>Pediste restablecer tu contraseña. Este link vence en ${datos.vigenciaMinutos} minutos.</p>` +
    `<p><a href="${escaparHtml(link)}">Restablecer contraseña</a></p>` +
    `<p>Si no fuiste vos, ignorá este mail: tu contraseña sigue siendo la misma.</p>`;

  return { subject, text, html };
}

/**
 * templateResetConfirmado — mail de aviso tras un reseteo exitoso.
 *
 * Ref spec: sdd/auth-reseteo-por-olvido/spec, Requirement "Un reset exitoso
 * dispara un mail de confirmación". Ref design: ADR-5 (paso 7). Tarea: 3.3.
 */
export function templateResetConfirmado(datos: DatosResetConfirmado): PlantillaEmail {
  const subject = 'Tu contraseña fue restablecida';
  const text =
    `Hola ${datos.nombre},\n\n` +
    `Tu contraseña se restableció con éxito. Si no fuiste vos, contactá a soporte.`;
  const html =
    `<p>Hola ${escaparHtml(datos.nombre)},</p>` +
    `<p>Tu contraseña se restableció con éxito. Si no fuiste vos, contactá a soporte.</p>`;

  return { subject, text, html };
}
