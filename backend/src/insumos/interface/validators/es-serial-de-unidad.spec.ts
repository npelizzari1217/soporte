import { describe, expect, it } from 'vitest';
import { esSerialDeUnidad } from './es-serial-de-unidad';

describe('esSerialDeUnidad', () => {
  it('acepta un serial normal y el de largo máximo', () => {
    expect(esSerialDeUnidad('SN-1')).toBe(true);
    expect(esSerialDeUnidad('a'.repeat(255))).toBe(true);
  });

  it('rechaza vacío, solo espacios y lo que no es string', () => {
    expect(esSerialDeUnidad('')).toBe(false);
    expect(esSerialDeUnidad('   ')).toBe(false);
    expect(esSerialDeUnidad(5)).toBe(false);
    expect(esSerialDeUnidad(null)).toBe(false);
  });

  it('rechaza el que supera el tope recortado', () => {
    expect(esSerialDeUnidad('a'.repeat(256))).toBe(false);
  });

  it('mide la forma NORMALIZADA: 128 "ß" son 128 cargados pero 256 normalizados', () => {
    expect(esSerialDeUnidad('ß'.repeat(127))).toBe(true);
    expect(esSerialDeUnidad('ß'.repeat(128))).toBe(false);
  });
});
