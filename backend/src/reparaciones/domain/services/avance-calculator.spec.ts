import { AvanceCalculator } from './avance-calculator';

/**
 * AvanceCalculator spec — función PURA, sin Prisma ni NestJS.
 *
 * Fórmula del spec:
 * ROUND(
 *   (COUNT(*) FILTER (WHERE completada = TRUE AND deleted_at IS NULL) * 100.0)
 *   / NULLIF(COUNT(*) FILTER (WHERE deleted_at IS NULL), 0),
 *   2
 * )
 *
 * Ref spec: [SPEC:reparaciones/Fórmula de porcentaje de avance]
 * Tarea: 5.A.1 / 5.A.2
 */
describe('AvanceCalculator', () => {
  describe('calcular()', () => {
    it('1 completada de 3 activas = 33.33', () => {
      const resultado = AvanceCalculator.calcular(1, 3);
      expect(resultado).toBe(33.33);
    });

    it('0 completadas de 3 activas = 0', () => {
      const resultado = AvanceCalculator.calcular(0, 3);
      expect(resultado).toBe(0);
    });

    it('3 completadas de 3 activas = 100.00', () => {
      const resultado = AvanceCalculator.calcular(3, 3);
      expect(resultado).toBe(100);
    });

    it('sin subtareas activas (0/0) = 0 — NULLIF evita división por cero', () => {
      const resultado = AvanceCalculator.calcular(0, 0);
      expect(resultado).toBe(0);
    });

    it('2 completadas de 3 activas = 66.67', () => {
      const resultado = AvanceCalculator.calcular(2, 3);
      expect(resultado).toBe(66.67);
    });

    it('1 completada de 2 activas = 50.00', () => {
      const resultado = AvanceCalculator.calcular(1, 2);
      expect(resultado).toBe(50);
    });

    it('resultado siempre tiene precisión de 2 decimales (sin trailing zeros extra)', () => {
      // 1/3 ≈ 33.333... → debe redondear a 33.33
      expect(AvanceCalculator.calcular(1, 3)).toBe(33.33);
    });

    it('resultado siempre es >= 0', () => {
      expect(AvanceCalculator.calcular(0, 5)).toBeGreaterThanOrEqual(0);
    });

    it('resultado nunca supera 100', () => {
      expect(AvanceCalculator.calcular(10, 10)).toBeLessThanOrEqual(100);
    });

    it('es una función pura — mismo input, mismo output en múltiples llamadas', () => {
      const r1 = AvanceCalculator.calcular(1, 3);
      const r2 = AvanceCalculator.calcular(1, 3);
      expect(r1).toBe(r2);
    });
  });

  describe('calcularDesdeSubtareas()', () => {
    it('calcula correctamente con lista de subtareas', () => {
      const subtareas = [
        { completada: true, deletedAt: null },
        { completada: false, deletedAt: null },
        { completada: false, deletedAt: null },
      ];
      expect(AvanceCalculator.calcularDesdeSubtareas(subtareas)).toBe(33.33);
    });

    it('excluye subtareas soft-deleted del numerador y denominador', () => {
      const subtareas = [
        { completada: true, deletedAt: new Date() }, // excluida (soft-deleted)
        { completada: false, deletedAt: null }, // activa, incompleta
      ];
      // Solo 1 activa, 0 completadas → 0/1 = 0
      expect(AvanceCalculator.calcularDesdeSubtareas(subtareas)).toBe(0);
    });

    it('subtarea completada soft-deleted NO cuenta en numerador', () => {
      const subtareas = [
        { completada: true, deletedAt: new Date() }, // soft-deleted, NO cuenta
        { completada: true, deletedAt: null }, // activa, completada
        { completada: false, deletedAt: null }, // activa, incompleta
      ];
      // 1 completada activa / 2 activas totales = 50
      expect(AvanceCalculator.calcularDesdeSubtareas(subtareas)).toBe(50);
    });

    it('lista vacía → 0 (NULLIF protección)', () => {
      expect(AvanceCalculator.calcularDesdeSubtareas([])).toBe(0);
    });

    it('todas completadas → 100', () => {
      const subtareas = [
        { completada: true, deletedAt: null },
        { completada: true, deletedAt: null },
      ];
      expect(AvanceCalculator.calcularDesdeSubtareas(subtareas)).toBe(100);
    });
  });
});
