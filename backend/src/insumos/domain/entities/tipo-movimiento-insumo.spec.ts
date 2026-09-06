import { describe, expect, it } from 'vitest';
import {
  calcularStock,
  DIRECCION_POR_TIPO_MOVIMIENTO,
  esAjuste,
  TIPOS_AJUSTE_INSUMO,
  TIPOS_MOVIMIENTO_INSUMO,
  TipoMovimientoInsumo,
} from './tipo-movimiento-insumo';

describe('Dirección de los tipos de movimiento de insumo', () => {
  /**
   * El compilador ya obliga a que el mapa cubra el catálogo entero —es un
   * `Record` sobre la unión derivada de `TIPOS_MOVIMIENTO_INSUMO`—, pero el
   * tipo se borra al compilar y no queda nada que falle si alguien reemplaza
   * el `Record` por un objeto suelto. Este assert es el que sobrevive a eso.
   */
  it('asigna dirección a TODOS los tipos del catálogo, sin faltantes ni sobrantes', () => {
    expect(Object.keys(DIRECCION_POR_TIPO_MOVIMIENTO).sort()).toEqual(
      [...TIPOS_MOVIMIENTO_INSUMO].sort(),
    );
  });

  it('suma la entrada y el ajuste positivo', () => {
    expect(DIRECCION_POR_TIPO_MOVIMIENTO.ENTRADA).toBe(1);
    expect(DIRECCION_POR_TIPO_MOVIMIENTO.AJUSTE_POSITIVO).toBe(1);
  });

  it('resta la salida y el ajuste negativo', () => {
    expect(DIRECCION_POR_TIPO_MOVIMIENTO.SALIDA).toBe(-1);
    expect(DIRECCION_POR_TIPO_MOVIMIENTO.AJUSTE_NEGATIVO).toBe(-1);
  });

  it('clasifica como ajuste a las dos direcciones del ajuste, y solo a ellas', () => {
    for (const tipo of TIPOS_MOVIMIENTO_INSUMO) {
      expect(esAjuste(tipo)).toBe((TIPOS_AJUSTE_INSUMO as readonly string[]).includes(tipo));
    }
  });
});

describe('calcularStock', () => {
  function sumas(parcial: Partial<Record<TipoMovimientoInsumo, number>> = {}) {
    return {
      ENTRADA: 0,
      SALIDA: 0,
      AJUSTE_POSITIVO: 0,
      AJUSTE_NEGATIVO: 0,
      ...parcial,
    };
  }

  /**
   * El insumo sin ninguna bitácora tiene stock cero, no "stock desconocido":
   * el puerto promete los cuatro tipos presentes en cero, y de esos cuatro
   * ceros la única lectura posible es que no hay nada en el depósito.
   */
  it('devuelve cero cuando el insumo no tiene ningún movimiento', () => {
    expect(calcularStock(sumas())).toBe(0);
  });

  it('suma las entradas', () => {
    expect(calcularStock(sumas({ ENTRADA: 40 }))).toBe(40);
  });

  it('resta las salidas', () => {
    expect(calcularStock(sumas({ ENTRADA: 40, SALIDA: 12 }))).toBe(28);
  });

  /**
   * El ajuste positivo asienta "el conteo físico dio más de lo registrado", y
   * eso AUMENTA lo disponible. Sin este término, una salida legítima se
   * rechazaría contra un stock que el ajuste ya había corregido hacia arriba.
   */
  it('suma el ajuste positivo', () => {
    expect(calcularStock(sumas({ ENTRADA: 40, AJUSTE_POSITIVO: 5 }))).toBe(45);
  });

  /**
   * El ajuste negativo asienta un faltante, así que REDUCE lo disponible. Si
   * la fórmula lo ignorara —o le diera el signo contrario—, el sistema
   * autorizaría a sacar unidades que el conteo físico ya declaró perdidas.
   */
  it('resta el ajuste negativo', () => {
    expect(calcularStock(sumas({ ENTRADA: 40, AJUSTE_NEGATIVO: 3 }))).toBe(37);
  });

  it('combina los CUATRO tipos en un solo saldo', () => {
    expect(
      calcularStock(sumas({ ENTRADA: 40, SALIDA: 12, AJUSTE_POSITIVO: 1, AJUSTE_NEGATIVO: 3 })),
    ).toBe(26);
  });

  it('devuelve un saldo negativo si la bitácora ya quedó en negativo', () => {
    expect(calcularStock(sumas({ ENTRADA: 5, SALIDA: 8 }))).toBe(-3);
  });

  /**
   * La trampa del float, y el motivo de que la suma vaya en centésimas:
   * `0.1 + 0.2 - 0.3` da `5.55e-17` en aritmética directa. Un saldo que
   * debería ser cero exacto pasaría a autorizar una salida infinitesimal, y
   * peor: el error de redondeo también puede caer del lado que RECHAZA una
   * salida legítima por el último decimal.
   */
  it('no arrastra el error de coma flotante: el saldo de 0,1 + 0,2 − 0,3 es cero exacto', () => {
    expect(calcularStock(sumas({ ENTRADA: 0.1, AJUSTE_POSITIVO: 0.2, SALIDA: 0.3 }))).toBe(0);
  });

  it('conserva los dos decimales de la columna', () => {
    expect(calcularStock(sumas({ ENTRADA: 10.25, SALIDA: 0.75 }))).toBe(9.5);
  });
});
