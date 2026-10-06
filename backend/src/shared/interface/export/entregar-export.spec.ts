import { BadRequestException, StreamableFile } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { entregarExport } from './entregar-export';
import { ParseFormatoExportPipe } from './formato-export.pipe';

function respuestaFalsa() {
  const headers = new Map<string, string>();
  return {
    res: { setHeader: (nombre: string, valor: string) => void headers.set(nombre, valor) },
    headers,
  };
}

describe('entregarExport', () => {
  it('csv: devuelve el texto y los headers de CSV', () => {
    const { res, headers } = respuestaFalsa();

    const salida = entregarExport(res, 'csv', {
      contenido: 'a;b',
      nombreArchivo: 'x-2026-08-19.csv',
    });

    expect(salida).toBe('a;b');
    expect(headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
    expect(headers.get('Content-Disposition')).toBe('attachment; filename="x-2026-08-19.csv"');
    expect(headers.get('Access-Control-Expose-Headers')).toBe('Content-Disposition');
  });

  it('xlsx: devuelve un StreamableFile (nunca el Buffer desnudo) y los headers de xlsx', () => {
    const { res, headers } = respuestaFalsa();
    const buffer = Buffer.from('PK');

    const salida = entregarExport(res, 'xlsx', {
      contenido: buffer,
      nombreArchivo: 'x-2026-08-19.xlsx',
    });

    expect(salida).toBeInstanceOf(StreamableFile);
    expect(headers.get('Content-Type')).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(headers.get('Content-Disposition')).toBe('attachment; filename="x-2026-08-19.xlsx"');
    expect(headers.get('Access-Control-Expose-Headers')).toBe('Content-Disposition');
  });
});

describe('ParseFormatoExportPipe', () => {
  const pipe = new ParseFormatoExportPipe();

  it('ausente → csv; csv y xlsx pasan', () => {
    expect(pipe.transform(undefined)).toBe('csv');
    expect(pipe.transform('csv')).toBe('csv');
    expect(pipe.transform('xlsx')).toBe('xlsx');
  });

  it.each(['pdf', 'XLSX', '', 'csv,xlsx'])('rechaza %j con 400', (valor) => {
    expect(() => pipe.transform(valor)).toThrow(BadRequestException);
  });
});
