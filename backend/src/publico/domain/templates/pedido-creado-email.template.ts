import { EmailMessage } from '../../../shared/domain/ports/i-email-sender';
import { escaparHtml } from '../../../shared/domain/escapar-html';

/** Cuerpo de una plantilla renderizada: subject/text/html (sin `to`). */
type PlantillaEmail = Omit<EmailMessage, 'to'>;

/** Datos de la plantilla del mail con el número del pedido confirmado. */
export interface DatosPedidoCreado {
  /** Nombre que escribió el visitante: texto libre, hostil por defecto. */
  nombre: string;
  /** Nombre del cliente (colegio, empresa) al que se le hizo el pedido. */
  clienteNombre: string;
  /** Número del ticket creado (lo genera el sistema). */
  numero: string;
}

/**
 * templatePedidoCreado — mail que informa el número del ticket creado al confirmar un pedido
 * público. Función pura, sin I/O. El `nombre` lo escribe un anónimo: va a `escaparHtml` en toda
 * interpolación del `html` y nunca al `text`. No lleva link al ticket: el externo no tiene sesión.
 *
 * Ref spec: sdd/formulario-publico-qr pedido-publico (D1). Tarea: 15.2.
 */
export function templatePedidoCreado(datos: DatosPedidoCreado): PlantillaEmail {
  const subject = `Recibimos tu pedido ${datos.numero} - ${datos.clienteNombre}`;
  const text =
    `Hola ${datos.nombre},\n\n` +
    `Tu pedido para ${datos.clienteNombre} quedó registrado con el número ${datos.numero}. ` +
    `Guardá este número por si necesitás consultarlo.`;
  const html =
    `<p>Hola ${escaparHtml(datos.nombre)},</p>` +
    `<p>Tu pedido para ${escaparHtml(datos.clienteNombre)} quedó registrado con el número ` +
    `<strong>${escaparHtml(datos.numero)}</strong>. Guardá este número por si necesitás consultarlo.</p>`;

  return { subject, text, html };
}
