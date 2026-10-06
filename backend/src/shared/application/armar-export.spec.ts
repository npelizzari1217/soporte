import { describe, expect, it } from 'vitest';

import { DomainError } from '../domain/result';
import { leerXlsx } from '../../testing/leer-xlsx';
import { ColumnaCsv } from '../infrastructure/csv/csv';
import { armarExport } from './armar-export';

class ErrorDePrueba extends DomainError {
  readonly code = 'PRUEBA_DEMASIADO_GRANDE';

  constructor(total: number, tope: number) {
    super(`${total} supera el tope de ${tope}`);
  }
}

const COLUMNAS: readonly ColumnaCsv<{ nombre: string }>[] = [
  { encabezado: 'Nombre', valor: (f) => f.nombre },
];

const armar = (total: number, formato?: 'csv' | 'xlsx') =>
  armarExport({
    filas: [{ nombre: 'A' }],
    total,
    tope: 5,
    columnas: COLUMNAS,
    prefijo: 'prueba',
    alExceder: (t, l) => new ErrorDePrueba(t, l),
    ahora: new Date('2026-08-20T01:30:00.000Z'),
    formato,
  });

describe('armarExport', () => {
  it('sin formato entrega CSV, como antes', async () => {
    const resultado = await armar(1);

    expect(resultado.getValue().contenido).toBe('﻿Nombre\r\nA');
    expect(resultado.getValue().nombreArchivo).toBe('prueba-2026-08-19.csv');
  });

  it('con formato xlsx entrega un libro real con la fecha argentina en el nombre', async () => {
    const resultado = await armar(1, 'xlsx');

    expect(resultado.getValue().nombreArchivo).toBe('prueba-2026-08-19.xlsx');
    const contenido = resultado.getValue().contenido;
    if (!Buffer.isBuffer(contenido)) {
      throw new Error('se esperaba un Buffer');
    }
    const libro = await leerXlsx(contenido);
    expect(libro.worksheets[0].getRow(2).getCell(1).value).toBe('A');
  });

  it.each(['csv', 'xlsx'] as const)(
    '%s: total === tope pasa y tope + 1 falla con el mismo error',
    async (formato) => {
      expect((await armar(5, formato)).isOk()).toBe(true);

      const excedido = await armar(6, formato);
      expect(excedido.isFail()).toBe(true);
      expect(excedido.getError()).toBeInstanceOf(ErrorDePrueba);
      expect(excedido.getError().message).toBe('6 supera el tope de 5');
    },
  );
});
