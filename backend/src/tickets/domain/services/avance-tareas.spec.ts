/**
 * [UNIT] `calcularAvanceTareas` (odd/tareas-con-tecnico, CA7): completadas activas / total
 * activas, con 2 decimales, 0 sin tareas activas.
 */
import { calcularAvanceTareas } from './avance-tareas';

describe('calcularAvanceTareas', () => {
  const borrada = new Date('2026-10-13T00:00:00Z');

  it('sin tareas, o con todas dadas de baja, el avance es 0', () => {
    expect(calcularAvanceTareas([])).toEqual({ total: 0, completadas: 0, porcentaje: 0 });
    expect(calcularAvanceTareas([{ completada: true, deletedAt: borrada, peso: 90 }])).toEqual({
      total: 0,
      completadas: 0,
      porcentaje: 0,
    });
  });

  it('las bajas no cuentan ni en el numerador ni en el denominador', () => {
    expect(
      calcularAvanceTareas([
        { completada: true, deletedAt: null, peso: 90 },
        { completada: true, deletedAt: borrada, peso: 90 },
        { completada: false, deletedAt: null, peso: 90 },
      ]),
    ).toEqual({ total: 2, completadas: 1, porcentaje: 50 });
  });

  it('redondea a 2 decimales', () => {
    const tareas = [
      { completada: true, deletedAt: null, peso: 90 },
      { completada: true, deletedAt: null, peso: 90 },
      { completada: false, deletedAt: null, peso: 90 },
    ];
    expect(calcularAvanceTareas(tareas).porcentaje).toBe(66.67);
  });

  it('todas completadas da 100', () => {
    expect(calcularAvanceTareas([{ completada: true, deletedAt: null, peso: 90 }]).porcentaje).toBe(
      100,
    );
  });

  // Los fixtures de arriba llevan peso 90 a propósito: en INTERNA el peso no puede mover el avance.

  describe('ticket EXTERNA (odd/edilicia-obra-externa, S3)', () => {
    it('el avance es la suma de los pesos de las tareas completadas activas', () => {
      expect(
        calcularAvanceTareas(
          [
            { completada: true, deletedAt: null, peso: 20 },
            { completada: true, deletedAt: null, peso: 15 },
            { completada: false, deletedAt: null, peso: 65 },
            { completada: true, deletedAt: borrada, peso: 40 },
          ],
          'EXTERNA',
        ),
      ).toEqual({ total: 3, completadas: 2, porcentaje: 35 });
    });

    it('tareas completadas sin peso no suman avance', () => {
      expect(
        calcularAvanceTareas([{ completada: true, deletedAt: null, peso: 0 }], 'EXTERNA')
          .porcentaje,
      ).toBe(0);
    });
  });
});
