/**
 * TicketPdfVista — modelo de vista PLANO de la ficha PDF de un ticket.
 *
 * Todo texto llega ya resuelto y formateado (nombres en lugar de ids, fechas
 * en hora de Argentina): el generador solo dibuja. Así el caso de uso se
 * prueba sin `pdfkit` y el adaptador se prueba sin base de datos.
 *
 * Por diseño NO tiene un campo para comentarios internos: el historial solo
 * sabe de comentarios públicos y cambios de estado.
 */

/** Logo del cliente en un formato que el generador sabe embeber. */
export interface LogoPdf {
  buffer: Buffer;
  formato: 'png' | 'jpeg';
}

/** Un renglón del historial: comentario público o cambio de estado. */
export interface EventoHistorialPdf {
  /** `dd/mm/aaaa hh:mm`, hora de Argentina. */
  fecha: string;
  autor: string;
  tipo: 'COMENTARIO' | 'CAMBIO_ESTADO';
  /** Texto del comentario, o `Estado: A -> B` (ASCII: la flecha Unicode no existe en la codificación estándar del PDF) en un cambio de estado. */
  texto: string;
}

export interface SoportePdf {
  /** Nombre del equipo asociado, o `null` si el ticket no tiene equipo. */
  equipo: string | null;
  descripcionProblema: string | null;
  solucionAplicada: string | null;
}

export interface SubtareaPdf {
  descripcion: string;
  completada: boolean;
}

export interface EdiliciaPdf {
  ubicacion: string | null;
  /** Porcentaje de avance, 0–100. */
  porcentajeAvance: number;
  subtareas: SubtareaPdf[];
}

export interface TicketPdfVista {
  cliente: {
    nombre: string;
    /** `null` si el cliente no tiene logo o su formato no es embebible (webp): se imprime el nombre. */
    logo: LogoPdf | null;
  };
  numero: string;
  titulo: string;
  estado: string;
  prioridad: string;
  tipo: string;
  /** Usuario registrado o solicitante externo; `null` si no hay dato. */
  solicitante: string | null;
  asignado: string | null;
  /** `dd/mm/aaaa hh:mm`, hora de Argentina. */
  creado: string;
  cerrado: string | null;
  vencimientoSla: string | null;
  descripcion: string | null;
  /** Presente solo en tickets de soporte. */
  soporte: SoportePdf | null;
  /** Presente solo en tickets edilicios (reparaciones). */
  edilicia: EdiliciaPdf | null;
  historial: EventoHistorialPdf[];
  /** Instante de generación, `dd/mm/aaaa hh:mm` en hora de Argentina (pie de página). */
  generadoEl: string;
}
