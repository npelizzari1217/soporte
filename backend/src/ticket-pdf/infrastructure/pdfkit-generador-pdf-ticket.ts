import PDFDocument from 'pdfkit';
import { IGeneradorPdfTicket } from '../domain/ports/i-generador-pdf-ticket';
import { TicketPdfVista } from '../domain/ticket-pdf-vista';

const MARGEN = 50;
const ANCHO_ETIQUETA = 120;
const COLOR_TEXTO = '#1f2933';
const COLOR_SUAVE = '#6b7280';
const COLOR_LINEA = '#d1d5db';
const ALTO_PIE = 40;

export interface OpcionesPdfkit {
  /**
   * Comprime los streams del PDF (default `true`). Los tests lo apagan para
   * poder leer el texto dentro del archivo sin descomprimir.
   */
  compress?: boolean;
}

/**
 * PdfkitGeneradorPdfTicket — adaptador de `IGeneradorPdfTicket` sobre
 * `pdfkit` (JS puro, sin navegador headless: el VPS es Windows sin Chrome).
 *
 * Solo dibuja el modelo de vista; no consulta nada ni decide qué se muestra.
 * A4, Helvetica (fuente estándar del PDF: cubre el español sin embeber
 * fuentes), pie con fecha de generación y "Página X de Y".
 */
export class PdfkitGeneradorPdfTicket implements IGeneradorPdfTicket {
  constructor(private readonly opciones: OpcionesPdfkit = {}) {}

  generar(vista: TicketPdfVista): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margin: MARGEN,
        bufferPages: true,
        compress: this.opciones.compress ?? true,
        info: { Title: `Ticket ${vista.numero}`, Subject: vista.titulo },
      });
      const partes: Buffer[] = [];
      doc.on('data', (parte: Buffer) => partes.push(parte));
      doc.on('end', () => resolve(Buffer.concat(partes)));
      doc.on('error', reject);

      try {
        this.dibujar(doc, vista);
        doc.end();
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private dibujar(doc: PDFKit.PDFDocument, vista: TicketPdfVista): void {
    const ancho = doc.page.width - MARGEN * 2;

    this.encabezado(doc, vista, ancho);

    doc.moveDown(0.8);
    doc.font('Helvetica-Bold').fontSize(15).fillColor(COLOR_TEXTO);
    doc.text(`${vista.numero} — ${vista.titulo}`, MARGEN, doc.y, { width: ancho });
    doc.moveDown(0.6);

    this.fila(doc, 'Estado', vista.estado);
    this.fila(doc, 'Prioridad', vista.prioridad);
    this.fila(doc, 'Tipo', vista.tipo);
    this.fila(doc, 'Solicitante', vista.solicitante);
    this.fila(doc, 'Asignado a', vista.asignado);
    this.fila(doc, 'Creado', vista.creado);
    this.fila(doc, 'Cerrado', vista.cerrado);
    this.fila(doc, 'Vencimiento SLA', vista.vencimientoSla);

    this.seccion(doc, 'Descripción');
    this.parrafo(doc, vista.descripcion);

    if (vista.soporte) {
      this.seccion(doc, 'Soporte');
      this.fila(doc, 'Equipo', vista.soporte.equipo);
      this.fila(doc, 'Problema', vista.soporte.descripcionProblema);
      this.fila(doc, 'Solución aplicada', vista.soporte.solucionAplicada);
    }

    if (vista.edilicia) {
      this.seccion(doc, 'Reparación');
      this.fila(doc, 'Ubicación', vista.edilicia.ubicacion);
      this.fila(doc, 'Avance', `${Math.round(vista.edilicia.porcentajeAvance)}%`);
      if (vista.edilicia.subtareas.length > 0) {
        doc.moveDown(0.3);
        for (const subtarea of vista.edilicia.subtareas) {
          this.asegurarEspacio(doc, 16);
          doc.font('Helvetica').fontSize(10).fillColor(COLOR_TEXTO);
          doc.text(
            `${subtarea.completada ? '[x]' : '[ ]'}  ${subtarea.descripcion}`,
            MARGEN + 10,
            doc.y,
            {
              width: ancho - 10,
            },
          );
        }
      }
    }

    this.seccion(doc, 'Historial');
    if (vista.historial.length === 0) {
      this.parrafo(doc, 'Sin comentarios públicos ni cambios de estado.');
    }
    for (const evento of vista.historial) {
      this.asegurarEspacio(doc, 40);
      doc.font('Helvetica-Bold').fontSize(9).fillColor(COLOR_SUAVE);
      const etiqueta = evento.tipo === 'COMENTARIO' ? 'Comentario' : 'Cambio de estado';
      doc.text(`${evento.fecha}  ·  ${evento.autor}  ·  ${etiqueta}`, MARGEN, doc.y, {
        width: ancho,
      });
      doc.font('Helvetica').fontSize(10).fillColor(COLOR_TEXTO);
      doc.text(evento.texto, MARGEN, doc.y + 1, { width: ancho });
      doc.moveDown(0.6);
    }

    this.pie(doc, vista);
  }

  private encabezado(doc: PDFKit.PDFDocument, vista: TicketPdfVista, ancho: number): void {
    const { logo, nombre } = vista.cliente;
    const yInicio = doc.y;
    let dibujado = false;
    if (logo) {
      try {
        doc.image(logo.buffer, MARGEN, yInicio, { fit: [160, 50] });
        doc.y = yInicio + 50;
        dibujado = true;
      } catch {
        // Imagen ilegible: se cae al nombre en texto, nunca se rompe el PDF.
        dibujado = false;
      }
    }
    if (!dibujado) {
      doc.font('Helvetica-Bold').fontSize(16).fillColor(COLOR_TEXTO);
      doc.text(nombre, MARGEN, yInicio, { width: ancho });
    }
    doc
      .moveTo(MARGEN, doc.y + 6)
      .lineTo(MARGEN + ancho, doc.y + 6)
      .strokeColor(COLOR_LINEA)
      .stroke();
    doc.y += 8;
  }

  private seccion(doc: PDFKit.PDFDocument, titulo: string): void {
    this.asegurarEspacio(doc, 50);
    doc.moveDown(0.8);
    doc.font('Helvetica-Bold').fontSize(12).fillColor(COLOR_TEXTO);
    doc.text(titulo, MARGEN, doc.y, { width: doc.page.width - MARGEN * 2 });
    doc.moveDown(0.3);
  }

  private parrafo(doc: PDFKit.PDFDocument, texto: string | null): void {
    doc.font('Helvetica').fontSize(10).fillColor(COLOR_TEXTO);
    doc.text(texto && texto.trim() !== '' ? texto : '—', MARGEN, doc.y, {
      width: doc.page.width - MARGEN * 2,
    });
  }

  /** Renglón `Etiqueta: valor`; un valor ausente se imprime como guion. */
  private fila(doc: PDFKit.PDFDocument, etiqueta: string, valor: string | null): void {
    const ancho = doc.page.width - MARGEN * 2 - ANCHO_ETIQUETA;
    const texto = valor && valor.trim() !== '' ? valor : '—';
    doc.font('Helvetica').fontSize(10);
    this.asegurarEspacio(doc, doc.heightOfString(texto, { width: ancho }) + 4);
    const y = doc.y;
    doc.font('Helvetica-Bold').fillColor(COLOR_SUAVE);
    doc.text(etiqueta, MARGEN, y, { width: ANCHO_ETIQUETA - 10 });
    doc.font('Helvetica').fillColor(COLOR_TEXTO);
    doc.text(texto, MARGEN + ANCHO_ETIQUETA, y, { width: ancho });
    doc.y = Math.max(doc.y, y + 12) + 3;
  }

  private asegurarEspacio(doc: PDFKit.PDFDocument, alto: number): void {
    if (doc.y + alto > doc.page.height - MARGEN - ALTO_PIE) {
      doc.addPage();
    }
  }

  /** Pie en TODAS las páginas: fecha de generación y "Página X de Y". */
  private pie(doc: PDFKit.PDFDocument, vista: TicketPdfVista): void {
    const rango = doc.bufferedPageRange();
    for (let i = 0; i < rango.count; i += 1) {
      doc.switchToPage(rango.start + i);
      // Con el margen inferior en 0 el texto del pie no dispara un salto de página.
      const margenInferior = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      const y = doc.page.height - MARGEN;
      const ancho = doc.page.width - MARGEN * 2;
      doc.font('Helvetica').fontSize(8).fillColor(COLOR_SUAVE);
      doc.text(`Generado el ${vista.generadoEl}`, MARGEN, y, {
        width: ancho / 2,
        align: 'left',
        lineBreak: false,
      });
      doc.text(`Página ${i + 1} de ${rango.count}`, MARGEN + ancho / 2, y, {
        width: ancho / 2,
        align: 'right',
        lineBreak: false,
      });
      doc.page.margins.bottom = margenInferior;
    }
  }
}
