/**
 * [UNIT] Suma de pesos de un ticket (odd/edilicia-obra-externa, S9, L16): nunca por encima de 100.
 */
import { sumaDePesosAdmitida, sumaDePesosConCambio } from './pesos-tareas';

describe('sumaDePesosConCambio', () => {
  const borrada = new Date('2026-11-06T00:00:00Z');
  const tareas = [
    { id: 'a', peso: 60, deletedAt: null },
    { id: 'b', peso: 30, deletedAt: null },
    { id: 'c', peso: 50, deletedAt: borrada },
  ];

  it('reemplaza el peso de la tarea que cambia y suma las demás activas', () => {
    expect(sumaDePesosConCambio(tareas, 'b', 40)).toBe(100);
  });

  it('una tarea dada de baja no cuenta', () => {
    expect(sumaDePesosConCambio(tareas, 'a', 60)).toBe(90);
  });
});

describe('sumaDePesosAdmitida', () => {
  it('admite hasta 100 inclusive y rechaza 101', () => {
    expect(sumaDePesosAdmitida(100)).toBe(true);
    expect(sumaDePesosAdmitida(101)).toBe(false);
  });
});
