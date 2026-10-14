/**
 * [UNIT] `calcularAvanceTareas` (odd/tareas-con-tecnico, CA7): completadas activas / total
 * activas, con 2 decimales, 0 sin tareas activas.
 */
import { calcularAvanceTareas } from './avance-tareas';

describe('calcularAvanceTareas', () => {
  const borrada = new Date('2026-10-13T00:00:00Z');

  it('sin tareas, o con todas dadas de baja, el avance es 0', () => {
    expect(calcularAvanceTareas([])).toEqual({ total: 0, completadas: 0, porcentaje: 0 });
    expect(calcularAvanceTareas([{ completada: true, deletedAt: borrada }])).toEqual({
      total: 0,
      completadas: 0,
      porcentaje: 0,
    });
  });

  it('las bajas no cuentan ni en el numerador ni en el denominador', () => {
    expect(
      calcularAvanceTareas([
        { completada: true, deletedAt: null },
        { completada: true, deletedAt: borrada },
        { completada: false, deletedAt: null },
      ]),
    ).toEqual({ total: 2, completadas: 1, porcentaje: 50 });
  });

  it('redondea a 2 decimales', () => {
    const tareas = [
      { completada: true, deletedAt: null },
      { completada: true, deletedAt: null },
      { completada: false, deletedAt: null },
    ];
    expect(calcularAvanceTareas(tareas).porcentaje).toBe(66.67);
  });

  it('todas completadas da 100', () => {
    expect(calcularAvanceTareas([{ completada: true, deletedAt: null }]).porcentaje).toBe(100);
  });
});
