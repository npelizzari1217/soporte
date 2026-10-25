import { describe, expect, it } from 'vitest';

import { vistaDePrueba, PNG_1X1 } from '../testing/pdf-vista.fixtures';
import { PdfkitGeneradorPdfTicket } from './pdfkit-generador-pdf-ticket';

/**
 * Texto de un PDF generado SIN compresión. pdfkit escribe el texto de las
 * fuentes estándar como cadenas hexadecimales dentro de operadores `TJ`
 * (`[<48656c6c6f> -10 <21>] TJ`): se concatenan las de cada operador y se
 * decodifican como latin1 (WinAnsi coincide con latin1 para el español).
 */
function textoDePdf(pdf: Buffer): string {
  const contenido = pdf.toString('latin1');
  const lineas: string[] = [];
  for (const operador of contenido.matchAll(/\[([^\]]*)\]\s*TJ/g)) {
    const hex = [...operador[1].matchAll(/<([0-9a-fA-F]*)>/g)].map((m) => m[1]).join('');
    lineas.push(Buffer.from(hex, 'hex').toString('latin1'));
  }
  return lineas.join('\n');
}

const generador = new PdfkitGeneradorPdfTicket({ compress: false });

describe('PdfkitGeneradorPdfTicket', () => {
  it('produce un PDF válido (%PDF…%%EOF) con el número, título y las etiquetas en español', async () => {
    const pdf = await generador.generar(vistaDePrueba());

    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(pdf.toString('latin1').trimEnd().endsWith('%%EOF')).toBe(true);
    const texto = textoDePdf(pdf);
    expect(texto).toContain('SOP-2026-00042');
    expect(texto).toContain('La impresora de secretaría no imprime');
    expect(texto).toContain('Prioridad');
    expect(texto).toContain('Vencimiento SLA');
    expect(texto).toContain('Descripción');
    expect(texto).toContain('Impresora HP LaserJet');
  });

  it('imprime el historial: comentario público y cambio de estado', async () => {
    const texto = textoDePdf(await generador.generar(vistaDePrueba()));

    expect(texto).toContain('Estado: Asignado -> En proceso');
    expect(texto).toContain('Se reemplazó el rodillo de arrastre');
    expect(texto).toContain('Cambio de estado');
  });

  it('sin logo imprime el nombre del cliente; con logo png lo embebe como imagen', async () => {
    const sinLogo = await generador.generar(vistaDePrueba());
    const conLogo = await generador.generar(
      vistaDePrueba({
        cliente: { nombre: 'Colegio San Martín', logo: { buffer: PNG_1X1, formato: 'png' } },
      }),
    );

    expect(textoDePdf(sinLogo)).toContain('Colegio San Martín');
    expect(sinLogo.toString('latin1')).not.toContain('/Subtype /Image');
    expect(conLogo.toString('latin1')).toContain('/Subtype /Image');
  });

  it('un logo ilegible no rompe el PDF: cae al nombre del cliente', async () => {
    const pdf = await generador.generar(
      vistaDePrueba({
        cliente: {
          nombre: 'Colegio San Martín',
          logo: { buffer: Buffer.from('no es una imagen'), formato: 'png' },
        },
      }),
    );

    expect(textoDePdf(pdf)).toContain('Colegio San Martín');
  });

  it('con ubicación, la imprime en la cabecera, en cualquier tipo de ticket (odd/ticket-unificado)', async () => {
    const texto = textoDePdf(
      await generador.generar(vistaDePrueba({ ubicacion: 'Edificio Central, planta baja' })),
    );

    expect(texto).toContain('Ubicación');
    expect(texto).toContain('Edificio Central, planta baja');
    // Ya no hay sección propia de Edilicia: la ubicación no es de la reparación.
    expect(texto).not.toContain('Reparación');
  });

  it('sin ubicación no imprime la fila', async () => {
    const texto = textoDePdf(await generador.generar(vistaDePrueba({ ubicacion: null })));

    expect(texto).not.toContain('Ubicación');
  });

  it('las tareas se imprimen con avance, técnico y estado, en un ticket que no es edilicio', async () => {
    const texto = textoDePdf(
      await generador.generar(
        vistaDePrueba({
          tareas: {
            porcentajeAvance: 50,
            completadas: 1,
            total: 2,
            items: [
              {
                descripcion: 'Cambiar cañería',
                tecnico: 'Ana Pérez',
                completada: true,
                completadaEn: '20/08/2026 09:10',
                completadaPor: 'Juan Díaz',
              },
              {
                descripcion: 'Pintar pared',
                tecnico: null,
                completada: false,
                completadaEn: null,
                completadaPor: null,
              },
            ],
          },
        }),
      ),
    );

    expect(texto).toContain('Tareas');
    expect(texto).toContain('50% (1 de 2 completadas)');
    expect(texto).toContain('[x]  Cambiar cañería');
    expect(texto).toContain('Técnico: Ana Pérez  ·  Completada el 20/08/2026 09:10 por Juan Díaz');
    expect(texto).toContain('[ ]  Pintar pared');
    expect(texto).toContain('Técnico: Sin técnico  ·  Pendiente');
  });

  it('sin tareas no imprime la sección', async () => {
    const texto = textoDePdf(await generador.generar(vistaDePrueba({ tareas: null })));

    expect(texto).not.toContain('Avance');
  });

  it('el pie lleva la fecha de generación y "Página X de Y" en cada página', async () => {
    const historial = Array.from({ length: 60 }, (_, i) => ({
      fecha: '20/08/2026 09:10',
      autor: 'Ana Pérez',
      tipo: 'COMENTARIO' as const,
      texto: `Comentario número ${i + 1} con un texto razonablemente largo para ocupar espacio en la página.`,
    }));

    const texto = textoDePdf(await generador.generar(vistaDePrueba({ historial })));

    const paginas = [...texto.matchAll(/Página (\d+) de (\d+)/g)].map((m) => [m[1], m[2]]);
    expect(paginas.length).toBeGreaterThan(1);
    const total = paginas[0][1];
    expect(paginas.map(([n]) => n)).toEqual(paginas.map((_, i) => String(i + 1)));
    expect(paginas.every(([, t]) => t === total)).toBe(true);
    expect([...texto.matchAll(/Generado el 20\/08\/2026 11:00/g)]).toHaveLength(paginas.length);
  });

  it('con compresión activa (producción) sigue siendo un PDF válido', async () => {
    const pdf = await new PdfkitGeneradorPdfTicket().generar(vistaDePrueba());

    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });
});
