import {
  afectaRelojSla,
  ESTADOS_NO_DESTINO_CORRECTIVO,
  ESTADOS_RELOJ_CORRE,
} from './estados.constants';

describe('estados.constants — reloj de SLA', () => {
  it('el reloj corre en NUEVO, ASIGNADO y EN_PROCESO, y solo en esos', () => {
    expect([...ESTADOS_RELOJ_CORRE].sort()).toEqual(['ASIGNADO', 'EN_PROCESO', 'NUEVO']);
  });

  it('ESPERANDO_CLIENTE es el único destino correctivo prohibido', () => {
    expect([...ESTADOS_NO_DESTINO_CORRECTIVO]).toEqual(['ESPERANDO_CLIENTE']);
  });

  describe('afectaRelojSla (sla-reloj-activo R1)', () => {
    it.each([
      ['EN_PROCESO', 'ESPERANDO_CLIENTE'],
      ['ESPERANDO_CLIENTE', 'EN_PROCESO'],
      ['ESPERANDO_CLIENTE', 'ASIGNADO'],
      ['ESPERANDO_CLIENTE', 'NUEVO'],
      ['EN_PROCESO', 'RESUELTO'],
      ['ESPERANDO_CLIENTE', 'RESUELTO'],
      ['RESUELTO', 'EN_PROCESO'],
      ['EN_PROCESO', 'CANCELADO'],
    ])('es verdadero para %s → %s', (anterior, nuevo) => {
      expect(afectaRelojSla(anterior, nuevo)).toBe(true);
    });

    it.each([
      ['NUEVO', 'ASIGNADO'],
      ['ASIGNADO', 'EN_PROCESO'],
      ['ASIGNADO', 'NUEVO'],
      ['RESUELTO', 'CERRADO'],
      ['ESPERANDO_CLIENTE', 'CANCELADO'],
    ])('es falso para %s → %s', (anterior, nuevo) => {
      expect(afectaRelojSla(anterior, nuevo)).toBe(false);
    });
  });
});
