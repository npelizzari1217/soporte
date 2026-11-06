import { LogoPdf } from './ticket-pdf-vista';

/**
 * CertificadoPdfVista — modelo de vista PLANO del PDF de un certificado de avance de obra
 * (odd/edilicia-obra-externa, S7): la salida hacia administración, que paga fuera del sistema.
 * Todo texto llega resuelto (nombres, fechas en hora de Argentina): el generador solo dibuja.
 */

/** Una tarea del certificado con el peso COPIADO al emitir (S8). */
export interface TareaCertificadoPdf {
  descripcion: string;
  peso: number;
}

export interface CertificadoPdfVista {
  cliente: { nombre: string; logo: LogoPdf | null };
  ticket: {
    numero: string;
    titulo: string;
    tipo: string;
    /** `null` si el ticket no tiene ubicación. */
    ubicacion: string | null;
  };
  numero: number;
  porcentaje: number;
  /** Suma de los porcentajes de los certificados VIGENTES del ticket. */
  acumuladoVigente: number;
  emitidoPor: string;
  /** `dd/mm/aaaa hh:mm`, hora de Argentina. */
  emitidoEn: string;
  /** Presente si el certificado está anulado: el PDF lo marca para que no se pague. */
  anulacion: { por: string; en: string; motivo: string } | null;
  tareas: TareaCertificadoPdf[];
  /** Instante de generación, `dd/mm/aaaa hh:mm` en hora de Argentina (pie de página). */
  generadoEl: string;
}
