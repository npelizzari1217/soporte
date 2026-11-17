import { LogoPdf } from '../../ticket-pdf/domain/ticket-pdf-vista';

/** Un ítem tal como se imprime: todo ya formateado, el generador no decide nada. */
export interface ItemCompraPdf {
  descripcion: string;
  esServicio: boolean;
  cantidad: string;
  proveedor: string;
  moneda: string;
  precioUnitario: string;
  total: string;
  aprobacion: 'Pendiente' | 'Aprobado' | 'Rechazado';
  fechaCotizacion: string;
  observaciones: string | null;
}

/**
 * Modelo de vista de la "Solicitud de compra" en PDF
 * (odd/tasks/compra-export-secciones-y-pdf.md, S4-S6).
 */
export interface CompraPdfVista {
  cliente: {
    nombre: string;
    logo: LogoPdf | null;
  };
  numero: string;
  fechaSolicitud: string;
  estado: string;
  motivo: string;
  descripcion: string | null;
  tipo: string | null;
  solicitante: string;
  items: ItemCompraPdf[];
  /** Total solicitado por moneda, en orden alfabético de moneda. */
  totales: Array<{ moneda: string; total: string }>;
  generadoEl: string;
}
