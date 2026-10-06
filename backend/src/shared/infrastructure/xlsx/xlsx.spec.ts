import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';

import {
  cantidadCsv,
  ColumnaCsv,
  diaArgentinoCelda,
  fechaCelda,
  fechaHoraCelda,
  montoCelda,
} from '../csv/csv';
import { leerXlsx } from '../../../testing/leer-xlsx';
import { serializarXlsx } from './xlsx';

interface Fila {
  numero: number;
  texto: string;
  creado: Date | null;
  dia: Date | null;
  fecha: Date | null;
  monto: number;
  cantidad: number;
}

const COLUMNAS: readonly ColumnaCsv<Fila>[] = [
  { encabezado: 'Número', valor: (f) => f.numero },
  { encabezado: 'Texto', valor: (f) => f.texto },
  { encabezado: 'Creado', valor: (f) => fechaHoraCelda(f.creado) },
  { encabezado: 'Día', valor: (f) => diaArgentinoCelda(f.dia) },
  { encabezado: 'Fecha', valor: (f) => fechaCelda(f.fecha) },
  { encabezado: 'Monto', valor: (f) => montoCelda(f.monto) },
  { encabezado: 'Cantidad', valor: (f) => cantidadCsv(f.cantidad, true) },
];

const FILA: Fila = {
  numero: 7,
  texto: '=HYPERLINK("http://x","Ver")',
  // 01:30 UTC del 2026-08-20 = 22:30 del 2026-08-19 en Argentina.
  creado: new Date('2026-08-20T01:30:45.000Z'),
  dia: new Date('2026-08-20T01:30:00.000Z'),
  fecha: new Date('2026-08-19T00:00:00.000Z'),
  monto: 1234.5,
  cantidad: 3,
};

async function leer(filas: readonly Fila[]): Promise<ExcelJS.Worksheet> {
  const buffer = await serializarXlsx(filas, COLUMNAS);
  const libro = await leerXlsx(buffer);
  return libro.worksheets[0];
}

describe('serializarXlsx', () => {
  it('es un zip válido (firma PK) y devuelve un Buffer', async () => {
    const buffer = await serializarXlsx([FILA], COLUMNAS);

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.subarray(0, 2).toString()).toBe('PK');
  });

  it('el encabezado es negrita, está congelado y lleva autofiltro', async () => {
    const hoja = await leer([FILA]);

    const encabezados = (hoja.getRow(1).values as unknown[]).slice(1);
    expect(encabezados).toEqual(COLUMNAS.map((c) => c.encabezado));
    hoja.getRow(1).eachCell((celda) => expect(celda.font?.bold).toBe(true));
    expect(hoja.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
    expect(hoja.autoFilter).toBe('A1:G1');
  });

  it('escribe números como celdas numéricas y las fechas como fechas reales con la hora argentina', async () => {
    const hoja = await leer([FILA]);
    const fila = hoja.getRow(2);

    expect(fila.getCell(1).value).toBe(7);
    expect(fila.getCell(6).value).toBe(1234.5);
    expect(fila.getCell(6).numFmt).toBe('0.00');
    expect(fila.getCell(7).value).toBe(3);
    expect(fila.getCell(7).numFmt).toBe('0');

    const creado = fila.getCell(3).value as Date;
    expect(creado).toBeInstanceOf(Date);
    expect(creado.toISOString()).toBe('2026-08-19T22:30:00.000Z');
    expect(fila.getCell(3).numFmt).toBe('dd/mm/yyyy hh:mm');

    expect((fila.getCell(4).value as Date).toISOString()).toBe('2026-08-19T00:00:00.000Z');
    expect(fila.getCell(4).numFmt).toBe('dd/mm/yyyy');
    expect((fila.getCell(5).value as Date).toISOString()).toBe('2026-08-19T00:00:00.000Z');
  });

  it('un texto que parece fórmula queda como texto, nunca como fórmula', async () => {
    const hoja = await leer([FILA]);
    const celda = hoja.getRow(2).getCell(2);

    expect(celda.type).toBe(ExcelJS.ValueType.String);
    expect(celda.value).toBe('=HYPERLINK("http://x","Ver")');
    expect(celda.formula).toBeUndefined();
  });

  it('las celdas null son vacías y una fila por dato (más el encabezado)', async () => {
    const hoja = await leer([FILA, { ...FILA, creado: null, dia: null, fecha: null }]);

    expect(hoja.rowCount).toBe(3);
    expect(hoja.getRow(3).getCell(3).value).toBeNull();
    expect(hoja.getRow(3).getCell(4).value).toBeNull();
  });

  it('sin filas igual entrega el encabezado', async () => {
    const hoja = await leer([]);

    expect(hoja.rowCount).toBe(1);
  });

  it('el ancho de columna sigue al contenido, entre un mínimo y un máximo', async () => {
    const largo = 'x'.repeat(200);
    const hoja = await leer([{ ...FILA, texto: largo }]);

    expect(hoja.getColumn(1).width).toBeGreaterThanOrEqual(10);
    expect(hoja.getColumn(2).width).toBe(60);
    expect(hoja.getColumn(3).width).toBeGreaterThan(hoja.getColumn(1).width ?? 0);
  });
});
