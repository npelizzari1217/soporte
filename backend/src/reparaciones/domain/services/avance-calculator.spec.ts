/**
 * T6.1 [UNIT][RED] — `AvanceCalculator.calcularDesdeSubtareas`.
 *
 * Redondeo 2 decimales; total activas=0 → 0; ignora subtareas
 * deleted/inactivas (deletedAt !== null).
 *
 * Ref spec: sdd/flujos-especializados/spec F3-E3, F3-E4. Ref design:
 * "Firmas TS clave" (AvanceCalculator). Tarea: T6.1, T6.2.
 */
import { AvanceCalculator } from './avance-calculator';

describe('AvanceCalculator', () => {
  describe('calcularDesdeSubtareas()', () => {
    it('retorna 0 cuando no hay subtareas activas', () => {
      expect(AvanceCalculator.calcularDesdeSubtareas([])).toBe(0);
    });

    it('retorna 0 cuando el total de activas es 0 (todas soft-deleted)', () => {
      const subtareas = [
        { completada: true, deletedAt: new Date() },
        { completada: false, deletedAt: new Date() },
      ];
      expect(AvanceCalculator.calcularDesdeSubtareas(subtareas)).toBe(0);
    });

    it('ignora subtareas soft-deleted en el cálculo (numerador y denominador)', () => {
      const subtareas = [
        { completada: true, deletedAt: null },
        { completada: true, deletedAt: new Date() }, // deleted, no cuenta
        { completada: false, deletedAt: null },
      ];
      // 1 completada activa / 2 activas totales = 50
      expect(AvanceCalculator.calcularDesdeSubtareas(subtareas)).toBe(50);
    });

    it('redondea a 2 decimales (1/3 = 33.33)', () => {
      const subtareas = [
        { completada: true, deletedAt: null },
        { completada: false, deletedAt: null },
        { completada: false, deletedAt: null },
      ];
      expect(AvanceCalculator.calcularDesdeSubtareas(subtareas)).toBe(33.33);
    });

    it('retorna 100 cuando todas las activas están completadas', () => {
      const subtareas = [
        { completada: true, deletedAt: null },
        { completada: true, deletedAt: null },
      ];
      expect(AvanceCalculator.calcularDesdeSubtareas(subtareas)).toBe(100);
    });
  });
});
