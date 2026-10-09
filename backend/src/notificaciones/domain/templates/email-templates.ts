import { EmailMessage } from '../../../shared/domain/ports/i-email-sender';
import { escaparHtml } from '../../../shared/domain/escapar-html';

/** Datos comunes a toda plantilla: identifican el ticket + el link de la app. */
interface DatosTicketBase {
  numero: string;
  titulo: string;
  ticketId: string;
  /** Base pública de la app (env `APP_BASE_URL`), inyectada por el caller (infra). */
  appBaseUrl: string;
  /**
   * El destinatario es un solicitante externo: no tiene cuenta, así que el mail NO lleva el link a
   * `/tickets/:id` (D5).
   */
  sinLink?: boolean;
}

/** Cuerpo de una plantilla renderizada: subject/text/html (sin `to` — lo agrega el listener). */
type PlantillaEmail = Omit<EmailMessage, 'to'>;

function linkTicket(datos: DatosTicketBase): string {
  return `${datos.appBaseUrl}/tickets/${datos.ticketId}`;
}

/** Cierre en texto plano: el link al ticket, salvo que el destinatario sea un externo. */
function textoLink(datos: DatosTicketBase): string {
  return datos.sinLink ? '' : `\n\nVer ticket: ${linkTicket(datos)}`;
}

/** Cierre en HTML: el link al ticket, salvo que el destinatario sea un externo. */
function htmlLink(datos: DatosTicketBase): string {
  return datos.sinLink ? '' : `<p><a href="${escaparHtml(linkTicket(datos))}">Ver ticket</a></p>`;
}

// escaparHtml vive en shared/domain/escapar-html.ts (WU-3, reseteo-contrasena-olvidada).

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
  const text =
    `El ticket ${datos.numero} - ${datos.titulo} cambió de estado: ` +
    `${datos.estadoAnteriorCodigo} → ${datos.estadoNuevoCodigo}.` +
    textoLink(datos);
  const html =
    `<p>El ticket <strong>${escaparHtml(datos.numero)}</strong> - ${escaparHtml(datos.titulo)} ` +
    `cambió de estado: ${escaparHtml(datos.estadoAnteriorCodigo)} → ` +
    `${escaparHtml(datos.estadoNuevoCodigo)}.</p>` +
    htmlLink(datos);

  return { subject, text, html };
}

/**
 * templateEsperandoCliente — aviso al solicitante de que el ticket quedó a la espera de su
 * respuesta (`ticket-esperando-cliente` R4). Sin link para el solicitante externo.
 */
export function templateEsperandoCliente(datos: DatosTicketBase): PlantillaEmail {
  const subject = `Ticket ${datos.numero}: necesitamos tu respuesta`;
  const text =
    `El ticket ${datos.numero} - ${datos.titulo} quedó a la espera de tu respuesta. ` +
    `Cuando comentes, retomamos la atención.` +
    textoLink(datos);
  const html =
    `<p>El ticket <strong>${escaparHtml(datos.numero)}</strong> - ${escaparHtml(datos.titulo)} ` +
    `quedó a la espera de tu respuesta. Cuando comentes, retomamos la atención.</p>` +
    htmlLink(datos);

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
  const text =
    `Hay un nuevo comentario en el ticket ${datos.numero} - ${datos.titulo}.` + textoLink(datos);
  const html =
    `<p>Hay un nuevo comentario en el ticket <strong>${escaparHtml(datos.numero)}</strong> - ` +
    `${escaparHtml(datos.titulo)}.</p>` +
    htmlLink(datos);

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
 * templatePrimeraRespuestaVencida — aviso al asignado y a los administradores de que un ticket sigue
 * sin primera respuesta pasada su meta (`sla-primera-respuesta` R4).
 */
export function templatePrimeraRespuestaVencida(datos: DatosTicketBase): PlantillaEmail {
  const subject = `Primera respuesta vencida — Ticket ${datos.numero}`;
  const link = linkTicket(datos);
  const text =
    `El ticket ${datos.numero} - ${datos.titulo} sigue sin primera respuesta y venció la meta.\n\n` +
    `Ver ticket: ${link}`;
  const html =
    `<p>El ticket <strong>${escaparHtml(datos.numero)}</strong> - ${escaparHtml(datos.titulo)} ` +
    `sigue sin primera respuesta y venció la meta.</p>` +
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

/**
 * templateTicketAsignado — aviso a la persona a la que se le asignó un ticket, ya sea por la regla
 * de su tipo o a mano (`notificacion-asignacion` N2). `tipoNombre` y `prioridadNombre` son
 * opcionales: si falta alguno, esa línea se omite sin cancelar el aviso.
 */
export function templateTicketAsignado(
  datos: DatosTicketBase & {
    origen: 'REGLA_TIPO' | 'MANUAL';
    tipoNombre?: string | null;
    prioridadNombre?: string | null;
  },
): PlantillaEmail {
  const subject = `Ticket ${datos.numero} asignado a usted`;
  const motivo =
    datos.origen === 'REGLA_TIPO'
      ? 'Se le asignó automáticamente, según la regla de su tipo,'
      : 'Le asignaron';
  const detalles: string[] = [];
  if (datos.tipoNombre) detalles.push(`Tipo: ${datos.tipoNombre}`);
  if (datos.prioridadNombre) detalles.push(`Prioridad: ${datos.prioridadNombre}`);

  const text =
    `${motivo} el ticket ${datos.numero} - ${datos.titulo}.` +
    (detalles.length > 0 ? `\n\n${detalles.join('\n')}` : '') +
    textoLink(datos);
  const html =
    `<p>${motivo} el ticket <strong>${escaparHtml(datos.numero)}</strong> - ` +
    `${escaparHtml(datos.titulo)}.</p>` +
    (detalles.length > 0
      ? `<ul>${detalles.map((d) => `<li>${escaparHtml(d)}</li>`).join('')}</ul>`
      : '') +
    htmlLink(datos);

  return { subject, text, html };
}
