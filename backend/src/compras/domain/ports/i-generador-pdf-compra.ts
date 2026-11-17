import { CompraPdfVista } from '../compra-pdf-vista';

export const GENERADOR_PDF_COMPRA = Symbol('IGeneradorPdfCompra');

/** Dibuja la solicitud de compra en PDF. Solo dibuja: no consulta ni decide qué mostrar. */
export interface IGeneradorPdfCompra {
  /**
   * @param vista datos ya formateados.
   * @returns el PDF.
   */
  generar(vista: CompraPdfVista): Promise<Buffer>;
}
