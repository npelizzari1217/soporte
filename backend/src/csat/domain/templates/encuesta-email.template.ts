import { EmailMessage } from '../../../shared/domain/ports/i-email-sender';

/** Datos de la plantilla del mail de encuesta. Sin `to` — lo agrega el listener/use case que envía. */
interface DatosEncuestaEmail {
  numero: string;
  titulo: string;
  /** Token CRUDO (no el hash) — es lo que se embebe en el link, nunca se persiste. */
  token: string;
  /** Base pública de la app (env `APP_BASE_URL`), inyectada por el caller (infra). No leer `process.env` acá. */
  appBaseUrl: string;
}

/** Cuerpo de una plantilla renderizada: subject/text/html (sin `to`). */
type PlantillaEmail = Omit<EmailMessage, 'to'>;

/**
 * templateEncuestaSatisfaccion — plantilla del mail de encuesta enviado al
 * cerrar un ticket con `csat_habilitado=true`. Función pura: sin I/O, sin
 * acceso a `process.env` — mismo criterio que
 * `notificaciones/domain/templates/email-templates.ts`.
 *
 * El link apunta a la página pública `/encuesta/{token}` (ADR-C7 del
 * design), NO a `/tickets/:id` — el destinatario responde sin sesión.
 *
 * Ref spec: sdd/csat/spec, Requirement "Emisión de token al cierre del
 * ticket". Ref design: flujo de datos ("link = APP_BASE_URL +
 * /encuesta/{token}"). Tarea: 4.6.
 */
export function templateEncuestaSatisfaccion(datos: DatosEncuestaEmail): PlantillaEmail {
  const link = `${datos.appBaseUrl}/encuesta/${datos.token}`;
  const subject = `¿Cómo fue tu experiencia con el ticket ${datos.numero}?`;
  const text =
    `Tu ticket ${datos.numero} - ${datos.titulo} fue cerrado. ` +
    `Contanos cómo fue tu experiencia:\n\n${link}`;
  const html =
    `<p>Tu ticket <strong>${datos.numero}</strong> - ${datos.titulo} fue cerrado. ` +
    `Contanos cómo fue tu experiencia:</p>` +
    `<p><a href="${link}">Responder encuesta</a></p>`;

  return { subject, text, html };
}
