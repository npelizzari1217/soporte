import { TicketPdfVista } from '../ticket-pdf-vista';

export const GENERADOR_PDF_TICKET = Symbol('IGeneradorPdfTicket');

/**
 * IGeneradorPdfTicket — puerto que dibuja la ficha PDF de un ticket a partir
 * de un modelo de vista ya resuelto. La implementación (pdfkit) vive en
 * infraestructura; el caso de uso solo conoce este contrato.
 */
export interface IGeneradorPdfTicket {
  /** @returns El PDF completo (A4) como buffer. */
  generar(vista: TicketPdfVista): Promise<Buffer>;
}
