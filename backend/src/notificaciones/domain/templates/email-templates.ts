import { EmailMessage } from '../../../shared/domain/ports/i-email-sender';

/** Datos comunes a toda plantilla: identifican el ticket + el link de la app. */
interface DatosTicketBase {
  numero: string;
  titulo: string;
  ticketId: string;
  /** Base pública de la app (env `APP_BASE_URL`), inyectada por el caller (infra). */
  appBaseUrl: string;
}

/** Cuerpo de una plantilla renderizada: subject/text/html (sin `to` — lo agrega el listener). */
type PlantillaEmail = Omit<EmailMessage, 'to'>;

function linkTicket(datos: DatosTicketBase): string {
  return `${datos.appBaseUrl}/tickets/${datos.ticketId}`;
}

/**
 * Escapa un valor para interpolarlo dentro del `html` de una plantilla.
 *
 * El `titulo` de un ticket lo escribe un usuario final: interpolado crudo, un
 * `<script>` o un `&` suelto llegan al cliente de correo del destinatario.
 *
 * Se aplica a TODA interpolación del `html`, no solo a `titulo`. La alternativa
 * —escapar únicamente lo que hoy sabemos que viene del usuario— obliga a que
 * quien agregue un campo mañana recuerde clasificarlo, y esa es exactamente la
 * clase de decisión que se olvida. Cubre también el contexto de atributo:
 * `href="${link}"` se rompe con una comilla adentro.
 *
 * NO se usa en el `text`: ahí el escapado sería el bug — el usuario vería
 * `&lt;` donde escribió `<`.
 *
 * @param valor Texto a interpolar en el `html`.
 * @returns El mismo texto con `& < > " '` convertidos a entidades.
 */
function escaparHtml(valor: string): string {
  return valor
    .replace(/&/g, '&amp;') // primero, o re-escaparía las entidades de abajo
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * templateCambioEstado — plantilla de `ticket.estado_cambiado` (N3).
 * Función pura: sin I/O, sin acceso a `process.env` (el caller resuelve
 * `appBaseUrl` e inyecta el resto de los datos).
 *
 * Ref spec: sdd/premium/spec N6. Ref design: ADR-P9. Tarea: N5/N6.
 */
export function templateCambioEstado(
  datos: DatosTicketBase & { estadoAnteriorCodigo: string; estadoNuevoCodigo: string },
): PlantillaEmail {
  const subject = `Ticket ${datos.numero} cambió de estado`;
  const link = linkTicket(datos);
  const text =
    `El ticket ${datos.numero} - ${datos.titulo} cambió de estado: ` +
    `${datos.estadoAnteriorCodigo} → ${datos.estadoNuevoCodigo}.\n\n` +
    `Ver ticket: ${link}`;
  const html =
    `<p>El ticket <strong>${escaparHtml(datos.numero)}</strong> - ${escaparHtml(datos.titulo)} ` +
    `cambió de estado: ${escaparHtml(datos.estadoAnteriorCodigo)} → ` +
    `${escaparHtml(datos.estadoNuevoCodigo)}.</p>` +
    `<p><a href="${escaparHtml(link)}">Ver ticket</a></p>`;

  return { subject, text, html };
}

/**
 * templateComentarioPublico — plantilla de `ticket.comentado` (comentario
 * público, N3).
 *
 * Ref spec: sdd/premium/spec N6. Ref design: ADR-P9. Tarea: N5/N6.
 */
export function templateComentarioPublico(datos: DatosTicketBase): PlantillaEmail {
  const subject = `Nuevo comentario en el ticket ${datos.numero}`;
  const link = linkTicket(datos);
  const text =
    `Hay un nuevo comentario en el ticket ${datos.numero} - ${datos.titulo}.\n\n` +
    `Ver ticket: ${link}`;
  const html =
    `<p>Hay un nuevo comentario en el ticket <strong>${escaparHtml(datos.numero)}</strong> - ` +
    `${escaparHtml(datos.titulo)}.</p>` +
    `<p><a href="${escaparHtml(link)}">Ver ticket</a></p>`;

  return { subject, text, html };
}

/**
 * templateSlaVencido — plantilla de `sla.vencido` (S4, N3/N4, PR-SLA-2).
 *
 * Ref spec: sdd/premium/spec N6, S4. Ref design: ADR-P9. Tarea: N5/N6, SB7/SB8.
 */
export function templateSlaVencido(datos: DatosTicketBase): PlantillaEmail {
  const subject = `SLA vencido — Ticket ${datos.numero}`;
  const link = linkTicket(datos);
  const text =
    `El SLA del ticket ${datos.numero} - ${datos.titulo} venció.\n\n` + `Ver ticket: ${link}`;
  const html =
    `<p>El SLA del ticket <strong>${escaparHtml(datos.numero)}</strong> - ` +
    `${escaparHtml(datos.titulo)} venció.</p>` +
    `<p><a href="${escaparHtml(link)}">Ver ticket</a></p>`;

  return { subject, text, html };
}

/**
 * templatePreventivoGenerado — plantilla de `preventivo.generado` ([R11],
 * WU-6). Se dispara solo cuando el barrido efectivamente creó un ticket
 * `PREVENTIVO` desde un plan vencido — nunca en un salteo.
 *
 * Ref spec: sdd/preventivo/spec, Requirement "Notificación solo al generar".
 * Ref design: ADR-PV2 (flujo de datos). Tarea: 6.2.
 */
export function templatePreventivoGenerado(datos: DatosTicketBase): PlantillaEmail {
  const subject = `Mantenimiento preventivo generado — Ticket ${datos.numero}`;
  const link = linkTicket(datos);
  const text =
    `Se generó el ticket de mantenimiento preventivo ${datos.numero} - ${datos.titulo}.\n\n` +
    `Ver ticket: ${link}`;
  const html =
    `<p>Se generó el ticket de mantenimiento preventivo <strong>${escaparHtml(datos.numero)}</strong> ` +
    `- ${escaparHtml(datos.titulo)}.</p>` +
    `<p><a href="${escaparHtml(link)}">Ver ticket</a></p>`;

  return { subject, text, html };
}
