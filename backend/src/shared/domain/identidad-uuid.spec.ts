import { describe, expect, it } from 'vitest';
import { esElMismoId } from './identidad-uuid';

const ID = '9f1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d';

describe('esElMismoId', () => {
  it('reconoce el mismo id escrito con otra capitalización', () => {
    expect(esElMismoId(ID, ID.toUpperCase())).toBe(true);
  });

  /**
   * El hermano invertido del caso de arriba. Sin él, una función que devolviera
   * `true` siempre pasaría el primero y la comparación no serviría para nada.
   */
  it('distingue dos ids realmente distintos', () => {
    expect(esElMismoId(ID, '00000000-0000-4000-8000-000000000000')).toBe(false);
  });

  /**
   * `null` es la ausencia de vínculo: iguala con otra ausencia y con nada más.
   * Los dos casos importan — el primero es "el ítem no tenía insumo y sigue sin
   * tenerlo", el segundo es "se lo están asignando", y confundirlos saltearía
   * el guard que protege el stock ya emitido.
   */
  it('dos ausencias son el mismo vínculo', () => {
    expect(esElMismoId(null, null)).toBe(true);
    expect(esElMismoId(null, undefined)).toBe(true);
  });

  it('una ausencia y un id NO son el mismo vínculo, en las dos direcciones', () => {
    expect(esElMismoId(null, ID)).toBe(false);
    expect(esElMismoId(ID, null)).toBe(false);
  });
});
