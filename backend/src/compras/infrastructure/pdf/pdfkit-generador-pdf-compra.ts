import PDFDocument from 'pdfkit';
import { CompraPdfVista, ItemCompraPdf } from '../../domain/compra-pdf-vista';
import { IGeneradorPdfCompra } from '../../domain/ports/i-generador-pdf-compra';

const MARGEN = 45;
const ALTO_PIE = 36;
const COLOR_ACENTO = '#1e3a5f';
const COLOR_TEXTO = '#1f2933';
const COLOR_SUAVE = '#6b7280';
const COLOR_LINEA = '#d1d5db';
const COLOR_FONDO = '#f3f5f8';
const COLOR_CEBRA = '#f9fafb';
const PADDING_CELDA = 5;

/** Color del rótulo de aprobación de cada ítem. */
const COLOR_APROBACION: Readonly<Record<ItemCompraPdf['aprobacion'], string>> = {
  Pendiente: '#b45309',
  Aprobado: '#15803d',
  Rechazado: '#b91c1c',
};

interface ColumnaTabla {
  titulo: string;
  ancho: number;
  alinear: 'left' | 'right' | 'center';
  /**
   * Celda de una sola línea (importes, cantidad, estado): si el texto no
   * entra se achica la fuente en vez de partirlo, porque un importe partido
   * en dos renglones se lee como dos números.
   */
  ajustar: boolean;
}

/** Tamaño mínimo al que se achica una celda de una sola línea. */
const FUENTE_MINIMA = 6;

/** Columnas de la tabla de ítems; suman el ancho útil de un A4 con `MARGEN`. */
const COLUMNAS: readonly ColumnaTabla[] = [
  { titulo: '#', ancho: 18, alinear: 'center', ajustar: true },
  { titulo: 'Descripción', ancho: 121, alinear: 'left', ajustar: false },
  { titulo: 'Cant.', ancho: 46, alinear: 'right', ajustar: true },
  { titulo: 'Proveedor', ancho: 66, alinear: 'left', ajustar: false },
  { titulo: 'Moneda', ancho: 42, alinear: 'center', ajustar: true },
  { titulo: 'Precio unit.', ancho: 76, alinear: 'right', ajustar: true },
  { titulo: 'Total', ancho: 82, alinear: 'right', ajustar: true },
  { titulo: 'Estado', ancho: 54, alinear: 'center', ajustar: true },
];

export interface OpcionesPdfkitCompra {
  /** Comprime los streams (default `true`). Los tests lo apagan para leer el texto. */
  compress?: boolean;
}

/**
 * PdfkitGeneradorPdfCompra — dibuja la "Solicitud de compra" con formato de
 * presupuesto (odd/tasks/compra-export-secciones-y-pdf.md, S4-S6): encabezado
 * con logo y número, recuadro de datos, tabla de ítems con su encabezado
 * repetido en cada página, totales por moneda y pie paginado.
 *
 * `pdfkit` (JS puro) por el mismo motivo que la ficha del ticket: el VPS es
 * Windows sin navegador headless.
 */
export class PdfkitGeneradorPdfCompra implements IGeneradorPdfCompra {
  constructor(private readonly opciones: OpcionesPdfkitCompra = {}) {}

  /**
   * @param vista datos ya formateados.
   * @returns el PDF.
   */
  generar(vista: CompraPdfVista): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        // El margen inferior incluye el pie: el salto de página automático de
        // un texto larguísimo corta antes de la franja donde va "Página X de Y".
        margins: { top: MARGEN, left: MARGEN, right: MARGEN, bottom: MARGEN + ALTO_PIE },
        bufferPages: true,
        compress: this.opciones.compress ?? true,
        info: { Title: `Solicitud de compra ${vista.numero}`, Subject: vista.motivo },
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

  private dibujar(doc: PDFKit.PDFDocument, vista: CompraPdfVista): void {
    this.encabezado(doc, vista);
    this.recuadroDatos(doc, vista);
    this.tablaItems(doc, vista.items);
    this.totales(doc, vista.totales);
    this.leyenda(doc);
    this.pie(doc, vista);
  }

  private ancho(doc: PDFKit.PDFDocument): number {
    return doc.page.width - MARGEN * 2;
  }

  /** Logo (o nombre) a la izquierda; título, número y fecha a la derecha; filete de color. */
  private encabezado(doc: PDFKit.PDFDocument, vista: CompraPdfVista): void {
    const ancho = this.ancho(doc);
    const y = MARGEN;
    let dibujado = false;
    if (vista.cliente.logo) {
      try {
        doc.image(vista.cliente.logo.buffer, MARGEN, y, { fit: [170, 55] });
        dibujado = true;
      } catch {
        // Imagen ilegible: se cae al nombre en texto, nunca se rompe el PDF.
        dibujado = false;
      }
    }
    if (!dibujado) {
      doc.font('Helvetica-Bold').fontSize(16).fillColor(COLOR_ACENTO);
      doc.text(vista.cliente.nombre, MARGEN, y + 8, { width: ancho / 2 });
    }

    const xDerecha = MARGEN + ancho / 2;
    doc.font('Helvetica-Bold').fontSize(18).fillColor(COLOR_ACENTO);
    doc.text('SOLICITUD DE COMPRA', xDerecha, y, { width: ancho / 2, align: 'right' });
    doc.font('Helvetica-Bold').fontSize(11).fillColor(COLOR_TEXTO);
    doc.text(`N.º ${vista.numero}`, xDerecha, y + 26, { width: ancho / 2, align: 'right' });
    doc.font('Helvetica').fontSize(9).fillColor(COLOR_SUAVE);
    doc.text(`Fecha de solicitud: ${vista.fechaSolicitud}`, xDerecha, y + 42, {
      width: ancho / 2,
      align: 'right',
    });

    const yFilete = y + 64;
    doc.rect(MARGEN, yFilete, ancho, 3).fill(COLOR_ACENTO);
    doc.y = yFilete + 16;
  }

  /** Recuadro sombreado con los datos generales, en dos columnas, y la descripción completa. */
  private recuadroDatos(doc: PDFKit.PDFDocument, vista: CompraPdfVista): void {
    const ancho = this.ancho(doc);
    const mitad = (ancho - 30) / 2;
    const xIzq = MARGEN + 12;
    const xDer = xIzq + mitad + 6;
    const yInicio = doc.y;

    const campos: Array<[string, string]> = [
      ['Motivo', vista.motivo],
      ['Estado', vista.estado],
      ['Tipo', vista.tipo ?? '—'],
      ['Solicitante', vista.solicitante],
    ];
    // Se mide primero para dibujar el fondo detrás del texto.
    doc.font('Helvetica').fontSize(10);
    const altoFila = (texto: string): number => doc.heightOfString(texto, { width: mitad }) + 16;
    const filas = [
      Math.max(altoFila(campos[0][1]), altoFila(campos[1][1])),
      Math.max(altoFila(campos[2][1]), altoFila(campos[3][1])),
    ];
    const altoDescripcion = vista.descripcion
      ? doc.heightOfString(vista.descripcion, { width: ancho - 24 }) + 18
      : 0;
    const alto = 12 + filas[0] + filas[1] + altoDescripcion + 4;

    doc.roundedRect(MARGEN, yInicio, ancho, alto, 6).fill(COLOR_FONDO);

    let y = yInicio + 10;
    campos.forEach(([etiqueta, valor], indice) => {
      const x = indice % 2 === 0 ? xIzq : xDer;
      this.campo(doc, etiqueta, valor, x, y, mitad);
      if (indice % 2 === 1) y += filas[(indice - 1) / 2];
    });
    if (vista.descripcion) {
      this.campo(doc, 'Descripción', vista.descripcion, xIzq, y, ancho - 24);
    }
    doc.y = yInicio + alto + 18;
  }

  private campo(
    doc: PDFKit.PDFDocument,
    etiqueta: string,
    valor: string,
    x: number,
    y: number,
    ancho: number,
  ): void {
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLOR_SUAVE);
    doc.text(etiqueta.toUpperCase(), x, y, { width: ancho, characterSpacing: 0.5 });
    doc.font('Helvetica').fontSize(10).fillColor(COLOR_TEXTO);
    doc.text(valor, x, y + 10, { width: ancho });
  }

  private tablaItems(doc: PDFKit.PDFDocument, items: readonly ItemCompraPdf[]): void {
    doc.font('Helvetica-Bold').fontSize(12).fillColor(COLOR_ACENTO);
    doc.text('Ítems', MARGEN, doc.y);
    doc.moveDown(0.4);
    this.encabezadoTabla(doc);

    if (items.length === 0) {
      doc.font('Helvetica-Oblique').fontSize(10).fillColor(COLOR_SUAVE);
      doc.text('La compra no tiene ítems.', MARGEN + PADDING_CELDA, doc.y + 8);
      doc.y += 8;
      return;
    }

    items.forEach((item, indice) => {
      const celdas = this.celdas(item, indice);
      const detalle = this.detalle(item);
      const anchoDescripcion = COLUMNAS[1].ancho - PADDING_CELDA * 2;
      doc.font('Helvetica').fontSize(9);
      const altoCeldas = Math.max(
        ...celdas.map((texto, c) =>
          COLUMNAS[c].ajustar
            ? doc.currentLineHeight()
            : doc.heightOfString(texto, { width: COLUMNAS[c].ancho - PADDING_CELDA * 2 }),
        ),
      );
      doc.fontSize(7.5);
      const altoDetalle = detalle
        ? doc.heightOfString(detalle, { width: anchoDescripcion }) + 3
        : 0;
      const alto = altoCeldas + altoDetalle + PADDING_CELDA * 2;

      if (doc.y + alto > doc.page.height - MARGEN - ALTO_PIE) {
        doc.addPage();
        this.encabezadoTabla(doc);
      }

      const y = doc.y;
      if (indice % 2 === 1) {
        doc.rect(MARGEN, y, this.ancho(doc), alto).fill(COLOR_CEBRA);
      }
      let x = MARGEN;
      celdas.forEach((texto, c) => {
        const columna = COLUMNAS[c];
        const esEstado = c === COLUMNAS.length - 1;
        const fuente = esEstado ? 'Helvetica-Bold' : 'Helvetica';
        const anchoUtil = columna.ancho - PADDING_CELDA * 2;
        doc
          .font(fuente)
          .fontSize(columna.ajustar ? this.tamanioQueEntra(doc, texto, anchoUtil, 9) : 9)
          .fillColor(esEstado ? COLOR_APROBACION[item.aprobacion] : COLOR_TEXTO);
        doc.text(texto, x + PADDING_CELDA, y + PADDING_CELDA, {
          width: anchoUtil,
          align: columna.alinear,
          lineBreak: !columna.ajustar,
        });
        x += columna.ancho;
      });
      if (detalle) {
        doc.font('Helvetica').fontSize(7.5).fillColor(COLOR_SUAVE);
        doc.text(
          detalle,
          MARGEN + COLUMNAS[0].ancho + PADDING_CELDA,
          y + PADDING_CELDA + altoCeldas + 3,
          {
            width: anchoDescripcion,
          },
        );
      }
      doc
        .moveTo(MARGEN, y + alto)
        .lineTo(MARGEN + this.ancho(doc), y + alto)
        .lineWidth(0.5)
        .strokeColor(COLOR_LINEA)
        .stroke();
      doc.y = y + alto;
    });
  }

  /** Mayor tamaño de fuente, hasta `maximo`, con el que `texto` entra en `ancho` sin partirse. */
  private tamanioQueEntra(
    doc: PDFKit.PDFDocument,
    texto: string,
    ancho: number,
    maximo: number,
  ): number {
    let tamanio = maximo;
    while (tamanio > FUENTE_MINIMA && doc.fontSize(tamanio).widthOfString(texto) > ancho) {
      tamanio -= 0.5;
    }
    return tamanio;
  }

  private encabezadoTabla(doc: PDFKit.PDFDocument): void {
    const y = doc.y;
    const alto = 20;
    doc.rect(MARGEN, y, this.ancho(doc), alto).fill(COLOR_ACENTO);
    let x = MARGEN;
    doc.font('Helvetica-Bold').fillColor('#ffffff');
    for (const columna of COLUMNAS) {
      const anchoUtil = columna.ancho - PADDING_CELDA * 2;
      doc.fontSize(this.tamanioQueEntra(doc, columna.titulo, anchoUtil, 8.5));
      doc.text(columna.titulo, x + PADDING_CELDA, y + 6, {
        width: columna.ancho - PADDING_CELDA * 2,
        align: columna.alinear,
        lineBreak: false,
      });
      x += columna.ancho;
    }
    doc.y = y + alto;
  }

  private celdas(item: ItemCompraPdf, indice: number): string[] {
    return [
      String(indice + 1),
      item.descripcion,
      item.cantidad,
      item.proveedor,
      item.moneda,
      item.precioUnitario,
      item.total,
      item.aprobacion,
    ];
  }

  /** Línea secundaria bajo la descripción: cotización, servicio y observaciones. */
  private detalle(item: ItemCompraPdf): string {
    const partes = [`Cotizado el ${item.fechaCotizacion}`];
    if (item.esServicio) partes.push('Servicio');
    const linea = partes.join(' · ');
    return item.observaciones ? `${linea}\nObs.: ${item.observaciones}` : linea;
  }

  /** Recuadro de totales alineado a la derecha, uno por moneda. */
  private totales(doc: PDFKit.PDFDocument, totales: CompraPdfVista['totales']): void {
    if (totales.length === 0) return;
    const anchoCaja = 220;
    const alto = 26 + totales.length * 18;
    if (doc.y + alto + 20 > doc.page.height - MARGEN - ALTO_PIE) doc.addPage();

    const x = MARGEN + this.ancho(doc) - anchoCaja;
    const y = doc.y + 14;
    doc.roundedRect(x, y, anchoCaja, alto, 6).fill(COLOR_FONDO);
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLOR_SUAVE);
    doc.text('TOTAL SOLICITADO', x + 12, y + 9, { width: anchoCaja - 24, characterSpacing: 0.5 });
    totales.forEach(({ moneda, total }, indice) => {
      const yFila = y + 24 + indice * 18;
      doc.font('Helvetica-Bold').fontSize(11).fillColor(COLOR_ACENTO);
      doc.text(moneda, x + 12, yFila, { width: 50 });
      doc.text(total, x + 62, yFila, { width: anchoCaja - 74, align: 'right' });
    });
    doc.y = y + alto;
  }

  /** Aclaración fija: el documento no es un comprobante fiscal (S4). */
  private leyenda(doc: PDFKit.PDFDocument): void {
    if (doc.y + 40 > doc.page.height - MARGEN - ALTO_PIE) doc.addPage();
    doc.font('Helvetica-Oblique').fontSize(8).fillColor(COLOR_SUAVE);
    doc.text(
      'Documento interno de solicitud de compra. No es una factura ni un comprobante fiscal.',
      MARGEN,
      doc.y + 22,
      { width: this.ancho(doc), align: 'center' },
    );
  }

  /** Pie en todas las páginas: fecha de generación y "Página X de Y". */
  private pie(doc: PDFKit.PDFDocument, vista: CompraPdfVista): void {
    const rango = doc.bufferedPageRange();
    for (let i = 0; i < rango.count; i += 1) {
      doc.switchToPage(rango.start + i);
      // Con el margen inferior en 0 el texto del pie no dispara un salto de página.
      const margenInferior = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      const ancho = this.ancho(doc);
      const y = doc.page.height - MARGEN + 6;
      doc
        .moveTo(MARGEN, y - 8)
        .lineTo(MARGEN + ancho, y - 8)
        .lineWidth(0.5)
        .strokeColor(COLOR_LINEA)
        .stroke();
      doc.font('Helvetica').fontSize(8).fillColor(COLOR_SUAVE);
      doc.text(`${vista.numero}  ·  Generado el ${vista.generadoEl}`, MARGEN, y, {
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
