import { ItemCompraEntity, ItemCompraProps } from './item-compra.entity';
import { CantidadInvalidaError } from '../errors/compras.errors';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const makeProps = (overrides: Partial<ItemCompraProps> = {}): ItemCompraProps => ({
  ticketCompraId: 'tc-id-0000-7000-a000-000000000001',
  descripcion: 'Silla ergonómica',
  cantidad: 5,
  unidad: 'unidad',
  precioUnitarioRef: 25000,
  observaciones: null,
  ...overrides,
});

describe('ItemCompraEntity', () => {
  describe('create() — validación de cantidad', () => {
    it('retorna ok cuando cantidad > 0 (entero)', () => {
      const result = ItemCompraEntity.create(makeProps({ cantidad: 5 }));
      expect(result.isOk()).toBe(true);
    });

    it('retorna ok cuando cantidad > 0 (decimal)', () => {
      const result = ItemCompraEntity.create(makeProps({ cantidad: 2.5 }));
      expect(result.isOk()).toBe(true);
      expect(result.getValue().cantidad).toBe(2.5);
    });

    it('retorna fail cuando cantidad = 0', () => {
      const result = ItemCompraEntity.create(makeProps({ cantidad: 0 }));
      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(CantidadInvalidaError);
      expect(result.getError().code).toBe('CANTIDAD_INVALIDA');
    });

    it('retorna fail cuando cantidad < 0', () => {
      const result = ItemCompraEntity.create(makeProps({ cantidad: -1 }));
      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(CantidadInvalidaError);
    });

    it('el mensaje de error incluye la cantidad inválida', () => {
      const result = ItemCompraEntity.create(makeProps({ cantidad: -3.5 }));
      expect(result.getError().message).toContain('-3.5');
    });
  });

  describe('create() — propiedades', () => {
    it('genera UUIDv7 como id si no se provee', () => {
      const result = ItemCompraEntity.create(makeProps());
      expect(result.isOk()).toBe(true);
      expect(result.getValue().id).toMatch(UUID_REGEX);
    });

    it('usa el id provisto si se pasa', () => {
      const id = 'fixed-id-0000-7000-a000-000000000099';
      const result = ItemCompraEntity.create(makeProps(), id);
      expect(result.getValue().id).toBe(id);
    });

    it('expone todos los getters correctamente', () => {
      const props = makeProps({
        ticketCompraId: 'tc-abc',
        descripcion: 'Monitor 27"',
        cantidad: 3,
        unidad: 'unidad',
        precioUnitarioRef: 150000,
        observaciones: 'Incluye soporte VESA',
      });
      const item = ItemCompraEntity.create(props).getValue();
      expect(item.ticketCompraId).toBe('tc-abc');
      expect(item.descripcion).toBe('Monitor 27"');
      expect(item.cantidad).toBe(3);
      expect(item.unidad).toBe('unidad');
      expect(item.precioUnitarioRef).toBe(150000);
      expect(item.observaciones).toBe('Incluye soporte VESA');
    });

    it('acepta campos nullable como null', () => {
      const item = ItemCompraEntity.create(
        makeProps({ unidad: null, precioUnitarioRef: null, observaciones: null }),
      ).getValue();
      expect(item.unidad).toBeNull();
      expect(item.precioUnitarioRef).toBeNull();
      expect(item.observaciones).toBeNull();
    });
  });

  describe('softDelete()', () => {
    it('marca el ítem como soft-deleted', () => {
      const item = ItemCompraEntity.create(makeProps()).getValue();
      expect(item.isDeleted()).toBe(false);
      item.softDelete();
      expect(item.isDeleted()).toBe(true);
      expect(item.deletedAt).toBeInstanceOf(Date);
    });
  });

  describe('reconstitute()', () => {
    it('preserva timestamps y campos al reconstituir desde persistencia', () => {
      const createdAt = new Date('2026-03-01T10:00:00Z');
      const updatedAt = new Date('2026-03-02T10:00:00Z');
      const item = ItemCompraEntity.reconstitute(
        makeProps({ descripcion: 'Teclado mecánico', cantidad: 10 }),
        'reconstituted-id',
        createdAt,
        updatedAt,
        null,
      );
      expect(item.id).toBe('reconstituted-id');
      expect(item.descripcion).toBe('Teclado mecánico');
      expect(item.cantidad).toBe(10);
      expect(item.createdAt).toBe(createdAt);
      expect(item.updatedAt).toBe(updatedAt);
      expect(item.isDeleted()).toBe(false);
    });

    it('reconstitute con deletedAt seteado → isDeleted() true', () => {
      const deletedAt = new Date();
      const item = ItemCompraEntity.reconstitute(
        makeProps(),
        'id-del',
        new Date(),
        new Date(),
        deletedAt,
      );
      expect(item.isDeleted()).toBe(true);
      expect(item.deletedAt).toBe(deletedAt);
    });
  });
});
