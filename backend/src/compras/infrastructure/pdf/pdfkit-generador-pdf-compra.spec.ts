/**
 * [UNIT] `PdfkitGeneradorPdfCompra` — la "Solicitud de compra" en PDF
 * (odd/tasks/compra-export-secciones-y-pdf.md, S4-S6).
 */
import { PNG_1X1 } from '../../../ticket-pdf/testing/pdf-vista.fixtures';
import { CompraPdfVista, ItemCompraPdf } from '../../domain/compra-pdf-vista';
import { PdfkitGeneradorPdfCompra } from './pdfkit-generador-pdf-compra';

/** Texto de un PDF sin compresión: las cadenas hex de cada operador `TJ`, decodificadas (WinAnsi ≈ latin1). */
function textoDePdf(pdf: Buffer): string {
  const contenido = pdf.toString('latin1');
  const lineas: string[] = [];
  for (const operador of contenido.matchAll(/\[([^\]]*)\]\s*TJ/g)) {
    const hex = [...operador[1].matchAll(/<([0-9a-fA-F]*)>/g)].map((m) => m[1]).join('');
    lineas.push(Buffer.from(hex, 'hex').toString('latin1'));
  }
  return lineas.join('\n');
}

/** Corridas de texto con su posición vertical: pdfkit escribe `1 0 0 1 x y Tm`, la fuente y después el `TJ`. */
function corridas(pdf: Buffer): Array<{ texto: string; y: number }> {
  const patron = /1 0 0 1 [\d.-]+ ([\d.-]+) Tm\s*(?:\/F\d+ [\d.]+ Tf\s*)?\[([^\]]*)\]\s*TJ/g;
  return [...pdf.toString('latin1').matchAll(patron)].map((m) => ({
    y: Number(m[1]),
    texto: [...m[2].matchAll(/<([0-9a-fA-F]*)>/g)]
      .map((h) => Buffer.from(h[1], 'hex').toString('latin1'))
      .join(''),
  }));
}

function cantidadDePaginas(pdf: Buffer): number {
  return [...pdf.toString('latin1').matchAll(/\/Type \/Page\b/g)].length;
}

function item(overrides: Partial<ItemCompraPdf> = {}): ItemCompraPdf {
  return {
    descripcion: 'Notebook Dell Latitude 5440',
    esServicio: false,
    cantidad: '2',
    proveedor: 'Proveedor SA',
    moneda: 'ARS',
    precioUnitario: '1.250.000,00',
    total: '2.500.000,00',
    aprobacion: 'Aprobado',
    fechaCotizacion: '15/01/2026',
    observaciones: null,
    ...overrides,
  };
}

function vista(overrides: Partial<CompraPdfVista> = {}): CompraPdfVista {
  return {
    cliente: { nombre: 'Colegio San Martín', logo: null },
    numero: 'COM-2026-00007',
    fechaSolicitud: '19/08/2026',
    estado: 'Aprobado parcialmente',
    motivo: 'Renovación del laboratorio',
    descripcion: 'Equipos para el aula de informática del segundo piso',
    tipo: 'Soporte',
    solicitante: 'Ana Pérez',
    items: [
      item(),
      item({
        descripcion: 'Instalación de red',
        esServicio: true,
        aprobacion: 'Rechazado',
        moneda: 'USD',
        precioUnitario: '300,00',
        total: '300,00',
        cantidad: '1',
        observaciones: 'Requiere corte de luz',
      }),
    ],
    totales: [
      { moneda: 'ARS', total: '2.500.000,00' },
      { moneda: 'USD', total: '300,00' },
    ],
    generadoEl: '17/11/2026 10:30',
    ...overrides,
  };
}

const generador = new PdfkitGeneradorPdfCompra({ compress: false });

describe('PdfkitGeneradorPdfCompra', () => {
  it('produce un PDF válido titulado "Solicitud de compra" con número, fecha y datos generales', async () => {
    const pdf = await generador.generar(vista());

    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(pdf.toString('latin1').trimEnd().endsWith('%%EOF')).toBe(true);
    const texto = textoDePdf(pdf);
    expect(texto).toContain('SOLICITUD DE COMPRA');
    expect(texto).toContain('N.º COM-2026-00007');
    expect(texto).toContain('Fecha de solicitud: 19/08/2026');
    expect(texto).toContain('Renovación del laboratorio');
    expect(texto).toContain('Equipos para el aula de informática del segundo piso');
    expect(texto).toContain('Aprobado parcialmente');
    expect(texto).toContain('Ana Pérez');
    expect(texto).not.toMatch(/factura\b(?! ni)/i);
  });

  it('un importe de ocho cifras entra en su columna sin partirse', async () => {
    const texto = textoDePdf(
      await generador.generar(
        vista({ items: [item({ precioUnitario: '99.999.999,99', total: '99.999.999,99' })] }),
      ),
    );

    expect(texto.split('\n').filter((linea) => linea === '99.999.999,99')).toHaveLength(2);
  });

  it('el encabezado "Moneda" entra en una sola línea', async () => {
    const textos = corridas(await generador.generar(vista())).map((c) => c.texto);

    expect(textos).toContain('Moneda');
    expect(textos).not.toContain('Mone');
  });

  it('importes de nueve y diez cifras entran en sus columnas sin partirse', async () => {
    const textos = corridas(
      await generador.generar(
        vista({ items: [item({ precioUnitario: '999.999.999,99', total: '9.999.999.999,99' })] }),
      ),
    ).map((c) => c.texto);

    expect(textos).toContain('999.999.999,99');
    expect(textos).toContain('9.999.999.999,99');
  });

  it('una cantidad decimal de cientos de miles entra en su columna sin partirse', async () => {
    const textos = corridas(
      await generador.generar(vista({ items: [item({ cantidad: '999.999,99' })] })),
    ).map((c) => c.texto);

    expect(textos).toContain('999.999,99');
  });

  it('un texto larguísimo pagina sin invadir la franja del pie', async () => {
    const pdf = await generador.generar(
      vista({
        descripcion: 'contexto '.repeat(600),
        items: [item({ observaciones: 'palabra '.repeat(400) })],
      }),
    );
    // Origen abajo: el pie ocupa y < MARGEN + ALTO_PIE (45 + 36 = 81).
    const delPie = corridas(pdf).filter((c) => c.y < 81);

    expect(cantidadDePaginas(pdf)).toBeGreaterThan(1);
    // El parser tiene que ver el pie real; si no, "nadie invade" no probaría nada.
    expect(delPie.some((c) => c.texto.startsWith('Página '))).toBe(true);
    expect(delPie.filter((c) => !/^(COM-|Página )/.test(c.texto))).toEqual([]);
  });

  it('lista cada ítem con precio y total en su moneda, su estado y el detalle de cotización y observaciones', async () => {
    const texto = textoDePdf(await generador.generar(vista()));

    // La descripción puede ocupar varias líneas de su celda: se compara sin los saltos.
    expect(texto.replace(/\s+/g, ' ')).toContain('Notebook Dell Latitude 5440');
    // Cada importe entra en una sola línea de su celda: no se parte en dos.
    expect(texto.split('\n')).toEqual(
      expect.arrayContaining(['1.250.000,00', '2.500.000,00', 'ARS']),
    );
    expect(texto).toContain('Instalación de red');
    expect(texto.split('\n')).toEqual(expect.arrayContaining(['USD', '300,00']));
    expect(texto.split('\n')).toContain('Rechazado');
    expect(texto).toContain('Cotizado el 15/01/2026 · Servicio');
    expect(texto).toContain('Obs.: Requiere corte de luz');
  });

  it('imprime el total solicitado por moneda y la aclaración de que no es un comprobante fiscal', async () => {
    const texto = textoDePdf(await generador.generar(vista()));

    expect(texto).toContain('TOTAL SOLICITADO');
    expect(texto).toContain('2.500.000,00');
    expect(texto).toContain('No es una factura ni un comprobante fiscal.');
  });

  it('una compra sin ítems lo dice y no imprime totales', async () => {
    const texto = textoDePdf(await generador.generar(vista({ items: [], totales: [] })));

    expect(texto).toContain('La compra no tiene ítems.');
    expect(texto).not.toContain('TOTAL SOLICITADO');
  });

  it('con muchos ítems pagina, repite el encabezado de la tabla y numera "Página X de Y"', async () => {
    const items = Array.from({ length: 60 }, (_, i) =>
      item({ descripcion: `Ítem número ${i + 1} con una descripción larga ${'x'.repeat(80)}` }),
    );
    const pdf = await generador.generar(vista({ items }));
    const texto = textoDePdf(pdf);
    const paginas = cantidadDePaginas(pdf);

    expect(paginas).toBeGreaterThan(1);
    expect(texto).toContain(`Página ${paginas} de ${paginas}`);
    // La última página puede traer solo los totales; todas las demás repiten el encabezado.
    expect(texto.match(/Precio unit\./g)?.length).toBeGreaterThanOrEqual(paginas - 1);
    expect(texto.match(/Precio unit\./g)?.length).toBeGreaterThan(1);
    expect(texto).toContain('Ítem número 60');
  });

  it('sin logo imprime el nombre del cliente; con logo lo embebe; un logo ilegible cae al nombre', async () => {
    const sinLogo = await generador.generar(vista());
    const conLogo = await generador.generar(
      vista({
        cliente: { nombre: 'Colegio San Martín', logo: { buffer: PNG_1X1, formato: 'png' } },
      }),
    );
    const ilegible = await generador.generar(
      vista({
        cliente: {
          nombre: 'Colegio San Martín',
          logo: { buffer: Buffer.from('no'), formato: 'png' },
        },
      }),
    );

    expect(textoDePdf(sinLogo)).toContain('Colegio San Martín');
    expect(sinLogo.toString('latin1')).not.toContain('/Subtype /Image');
    expect(conLogo.toString('latin1')).toContain('/Subtype /Image');
    expect(textoDePdf(ilegible)).toContain('Colegio San Martín');
  });
});
