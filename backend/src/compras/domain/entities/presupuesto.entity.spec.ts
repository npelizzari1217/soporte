/**
 * T2.3/T2.4 [UNIT] — RED→GREEN: `PresupuestoEntity`.
 *
 * `create()` valida moneda ISO 4217 (ARS/USD/EUR) y `montoTotal >= 0`
 * (F3-C3). `seleccionar()`/`deseleccionar()` son mutadores puros — la
 * invariante "un solo seleccionado por ticket_compra" la garantiza
 * `SeleccionarPresupuestoUseCase` (ADR-7, swap atómico), no la entidad.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-C3. Ref design: ADR-7,
 * "Firmas TS clave" (PresupuestoEntity). Tarea: T2.3, T2.4.
 */
import { PresupuestoEntity } from './presupuesto.entity';
import { MonedaInvalidaError, MontoInvalidoError } from '../errors/compras.errors';

function baseProps() {
  return {
    ticketCompraId: 'ticket-compra-uuid',
    proveedor: 'Proveedor SRL',
    montoTotal: 150000,
    moneda: 'ARS',
    fechaCotizacion: new Date('2026-01-15'),
    seleccionado: false,
    observaciones: null,
  };
}

describe('PresupuestoEntity', () => {
  describe('create()', () => {
    it('crea el presupuesto con moneda ARS (default) y monto >= 0', () => {
      const result = PresupuestoEntity.create(baseProps());

      expect(result.isOk()).toBe(true);
      const presupuesto = result.getValue();
      expect(presupuesto.proveedor).toBe('Proveedor SRL');
      expect(presupuesto.montoTotal).toBe(150000);
      expect(presupuesto.moneda).toBe('ARS');
      expect(presupuesto.seleccionado).toBe(false);
      expect(presupuesto.id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it.each(['ARS', 'USD', 'EUR'])('acepta la moneda ISO 4217 %s', (moneda) => {
      const result = PresupuestoEntity.create({ ...baseProps(), moneda });
      expect(result.isOk()).toBe(true);
    });

    it('rechaza una moneda no ISO 4217 (ej. "PESOS") con MonedaInvalidaError', () => {
      const result = PresupuestoEntity.create({ ...baseProps(), moneda: 'PESOS' });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(MonedaInvalidaError);
    });

    it('acepta montoTotal = 0', () => {
      const result = PresupuestoEntity.create({ ...baseProps(), montoTotal: 0 });
      expect(result.isOk()).toBe(true);
    });

    it('rechaza montoTotal negativo con MontoInvalidoError', () => {
      const result = PresupuestoEntity.create({ ...baseProps(), montoTotal: -1 });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(MontoInvalidoError);
    });
  });

  describe('seleccionar()/deseleccionar()', () => {
    it('seleccionar() marca seleccionado = true', () => {
      const presupuesto = PresupuestoEntity.create(baseProps()).getValue();
      presupuesto.seleccionar();
      expect(presupuesto.seleccionado).toBe(true);
    });

    it('deseleccionar() marca seleccionado = false', () => {
      const presupuesto = PresupuestoEntity.create({
        ...baseProps(),
        seleccionado: true,
      }).getValue();
      presupuesto.deseleccionar();
      expect(presupuesto.seleccionado).toBe(false);
    });
  });

  describe('reconstitute()', () => {
    it('reconstruye desde persistencia sin re-validar moneda/monto', () => {
      const createdAt = new Date('2026-01-01T00:00:00Z');
      const updatedAt = new Date('2026-01-02T00:00:00Z');

      const presupuesto = PresupuestoEntity.reconstitute(
        baseProps(),
        'db-uuid-presupuesto',
        createdAt,
        updatedAt,
        null,
      );

      expect(presupuesto.id).toBe('db-uuid-presupuesto');
      expect(presupuesto.createdAt).toEqual(createdAt);
      expect(presupuesto.deletedAt).toBeNull();
    });
  });
});
