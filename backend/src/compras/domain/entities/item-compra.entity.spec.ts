/**
 * T2.1/T2.2 [UNIT] — RED→GREEN: `ItemCompraEntity`.
 *
 * `create()` valida `cantidad > 0` (CHECK de dominio y de DB, F3-C2) y
 * retorna `Result.fail(CantidadInvalidaError)` si viola.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-C2. Ref design: "Firmas TS
 * clave" (ItemCompraEntity). Tarea: T2.1, T2.2.
 */
import { ItemCompraEntity } from './item-compra.entity';
import { CantidadInvalidaError } from '../errors/compras.errors';

function baseProps() {
  return {
    ticketCompraId: 'ticket-compra-uuid',
    descripcion: 'Notebook 15"',
    cantidad: 2,
    unidad: 'unidad',
    precioUnitarioRef: 150000,
    observaciones: null,
  };
}

describe('ItemCompraEntity', () => {
  describe('create()', () => {
    it('crea el item cuando cantidad > 0', () => {
      const result = ItemCompraEntity.create(baseProps());

      expect(result.isOk()).toBe(true);
      const item = result.getValue();
      expect(item.ticketCompraId).toBe('ticket-compra-uuid');
      expect(item.descripcion).toBe('Notebook 15"');
      expect(item.cantidad).toBe(2);
      expect(item.unidad).toBe('unidad');
      expect(item.precioUnitarioRef).toBe(150000);
      expect(item.id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('rechaza cantidad = 0 con CantidadInvalidaError', () => {
      const result = ItemCompraEntity.create({ ...baseProps(), cantidad: 0 });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(CantidadInvalidaError);
    });

    it('rechaza cantidad negativa con CantidadInvalidaError', () => {
      const result = ItemCompraEntity.create({ ...baseProps(), cantidad: -5 });

      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(CantidadInvalidaError);
    });

    it('acepta unidad/precioUnitarioRef/observaciones nulos', () => {
      const result = ItemCompraEntity.create({
        ...baseProps(),
        unidad: null,
        precioUnitarioRef: null,
        observaciones: null,
      });

      expect(result.isOk()).toBe(true);
      expect(result.getValue().unidad).toBeNull();
      expect(result.getValue().precioUnitarioRef).toBeNull();
    });

    it('acepta un id explícito (mapper de infraestructura)', () => {
      const result = ItemCompraEntity.create(baseProps(), 'explicit-item-id');
      expect(result.getValue().id).toBe('explicit-item-id');
    });
  });

  describe('reconstitute()', () => {
    it('reconstruye una entidad desde persistencia sin re-validar cantidad', () => {
      const createdAt = new Date('2026-01-01T00:00:00Z');
      const updatedAt = new Date('2026-01-02T00:00:00Z');

      const item = ItemCompraEntity.reconstitute(
        baseProps(),
        'db-uuid-item',
        createdAt,
        updatedAt,
        null,
      );

      expect(item.id).toBe('db-uuid-item');
      expect(item.createdAt).toEqual(createdAt);
      expect(item.updatedAt).toEqual(updatedAt);
      expect(item.deletedAt).toBeNull();
    });
  });

  describe('softDelete() (heredado de BaseEntity)', () => {
    it('marca el item como eliminado lógicamente', () => {
      const item = ItemCompraEntity.create(baseProps()).getValue();
      item.softDelete();
      expect(item.isDeleted()).toBe(true);
    });
  });
});
