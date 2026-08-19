import { afterEach, describe, expect, it, vi } from 'vitest';

import { DomainError } from '../domain/result';
import { ColumnaCsv } from '../infrastructure/csv/csv';
import { armarExportCsv } from './armar-export-csv';

interface FilaPrueba {
  nombre: string;
}

/** Error de dominio mínimo para probar `alExceder` sin depender de ningún módulo real. */
class ErrorDePrueba extends DomainError {
  readonly code = 'PRUEBA_DEMASIADO_GRANDE';

  constructor(total: number, tope: number) {
    super(`${total} supera el tope de ${tope}`);
  }
}

const COLUMNAS: readonly ColumnaCsv<FilaPrueba>[] = [
  { encabezado: 'Nombre', valor: (f) => f.nombre },
];

const armar = (total: number, tope: number) =>
  armarExportCsv({
    filas: [{ nombre: 'A' }],
    total,
    tope,
    columnas: COLUMNAS,
    prefijo: 'prueba',
    alExceder: (t, l) => new ErrorDePrueba(t, l),
  });

describe('armarExportCsv — tope de filas', () => {
  it('cuando total === tope, arma el archivo sin error', () => {
    const resultado = armar(5, 5);

    expect(resultado.isOk()).toBe(true);
    expect(resultado.getValue().contenido).toContain('Nombre');
    expect(resultado.getValue().nombreArchivo).toMatch(/^prueba-\d{4}-\d{2}-\d{2}\.csv$/);
  });

  it('cuando total === tope + 1, falla y NO arma contenido', () => {
    const resultado = armar(6, 5);

    expect(resultado.isFail()).toBe(true);
    expect(resultado.getError()).toBeInstanceOf(ErrorDePrueba);
    expect(resultado.getError().message).toBe('6 supera el tope de 5');
  });

  describe('sufijo de fecha del nombre de archivo', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('usa el día calendario de Argentina, no el de UTC', () => {
      // 2026-03-02T01:30 UTC son las 22:30 del 2026-03-01 en Argentina
      // (UTC-3): UTC y Argentina caen en DÍAS DISTINTOS a propósito, para
      // que un sufijo calculado en UTC (el bug que este test detecta)
      // produzca `prueba-2026-03-02.csv` en vez de `prueba-2026-03-01.csv`
      // y la aserción de abajo falle.
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-03-02T01:30:00.000Z'));

      const resultado = armar(1, 1);

      expect(resultado.getValue().nombreArchivo).toBe('prueba-2026-03-01.csv');
    });
  });
});
