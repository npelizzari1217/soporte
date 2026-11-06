import { CertificadoPdfVista } from '../certificado-pdf-vista';

export const GENERADOR_PDF_CERTIFICADO = Symbol('IGeneradorPdfCertificado');

/**
 * IGeneradorPdfCertificado — dibuja el PDF de un certificado de avance a partir de un modelo de
 * vista ya resuelto (odd/edilicia-obra-externa, S7). La implementación vive en infraestructura.
 */
export interface IGeneradorPdfCertificado {
  /** @returns El PDF completo (A4) como buffer. */
  generarCertificado(vista: CertificadoPdfVista): Promise<Buffer>;
}
