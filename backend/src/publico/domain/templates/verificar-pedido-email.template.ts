import { EmailMessage } from '../../../shared/domain/ports/i-email-sender';
import { escaparHtml } from '../../../shared/domain/escapar-html';

/** Cuerpo de una plantilla renderizada: subject/text/html (sin `to`). */
type PlantillaEmail = Omit<EmailMessage, 'to'>;

/** Datos de la plantilla del mail de verificación del pedido público. */
export interface DatosVerificarPedido {
  /** Nombre que escribió el visitante: texto libre, hostil por defecto. */
  nombre: string;
  /** Nombre del cliente (colegio, empresa) al que se le hace el pedido. */
  clienteNombre: string;
  /** Link completo, con el token CRUDO en el fragmento. Se arma desde `APP_BASE_URL`, nunca `Host`. */
  link: string;
  /** Vigencia del link en horas (la dicta `PEDIDO_PUBLICO_TTL_MS`). */
  vigenciaHoras: number;
}

/**
 * templateVerificarPedido — mail con el link que confirma un pedido público. Función pura, sin I/O.
 *
 * El `nombre` lo escribe un anónimo: va a `escaparHtml` en TODA interpolación del `html` (también
 * el `href`) y nunca al `text`. El token viaja en el FRAGMENTO del link, así que no llega a los
 * access logs ni al `Referer` (mismo criterio que el reseteo de contraseña).
 *
 * Ref spec: sdd/formulario-publico-qr pedido-publico (D1). Tarea: 13.2.
 */
export function templateVerificarPedido(datos: DatosVerificarPedido): PlantillaEmail {
  const subject = `Confirmá tu pedido a ${datos.clienteNombre}`;
  const text =
    `Hola ${datos.nombre},\n\n` +
    `Recibimos un pedido a nombre tuyo para ${datos.clienteNombre}. ` +
    `Para que llegue al equipo, confirmalo con este link (vence en ${datos.vigenciaHoras} horas):\n\n` +
    `${datos.link}\n\n` +
    `Si no hiciste este pedido, ignorá este mail: no se crea nada hasta que lo confirmes.`;
  const html =
    `<p>Hola ${escaparHtml(datos.nombre)},</p>` +
    `<p>Recibimos un pedido a nombre tuyo para ${escaparHtml(datos.clienteNombre)}. ` +
    `Para que llegue al equipo, confirmalo con este link (vence en ${datos.vigenciaHoras} horas).</p>` +
    `<p><a href="${escaparHtml(datos.link)}">Confirmar mi pedido</a></p>` +
    `<p>Si no hiciste este pedido, ignorá este mail: no se crea nada hasta que lo confirmes.</p>`;

  return { subject, text, html };
}
