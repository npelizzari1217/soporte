import { PresupuestoEntity, PresupuestoProps } from './presupuesto.entity';
import { MonedaInvalidaError } from '../errors/compras.errors';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const makeProps = (overrides: Partial<PresupuestoProps> = {}): PresupuestoProps => ({
  ticketCompraId: 'tc-pres-0000-7000-a000-000000000001',
  proveedor: 'Proveedor SA',
  montoTotal: 50000,
  moneda: 'ARS',
  fechaCotizacion: new Date('2026-06-01'),
  seleccionado: false,
  observaciones: null,
  ...overrides,
});

describe('PresupuestoEntity', () => {
  describe('create() — validación de moneda ISO 4217', () => {
    it('retorna ok con moneda ARS', () => {
      const result = PresupuestoEntity.create(makeProps({ moneda: 'ARS' }));
      expect(result.isOk()).toBe(true);
    });

    it('retorna ok con moneda USD', () => {
      const result = PresupuestoEntity.create(makeProps({ moneda: 'USD' }));
      expect(result.isOk()).toBe(true);
      expect(result.getValue().moneda).toBe('USD');
    });

    it('retorna ok con moneda EUR', () => {
      const result = PresupuestoEntity.create(makeProps({ moneda: 'EUR' }));
      expect(result.isOk()).toBe(true);
    });

    it('retorna fail con moneda inválida', () => {
      const result = PresupuestoEntity.create(makeProps({ moneda: 'XYZ' }));
      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(MonedaInvalidaError);
      expect(result.getError().code).toBe('MONEDA_INVALIDA');
    });

    it('retorna fail con moneda vacía', () => {
      const result = PresupuestoEntity.create(makeProps({ moneda: '' }));
      expect(result.isFail()).toBe(true);
      expect(result.getError()).toBeInstanceOf(MonedaInvalidaError);
    });

    it('retorna fail con moneda en minúsculas (case-sensitive)', () => {
      const result = PresupuestoEntity.create(makeProps({ moneda: 'ars' }));
      expect(result.isFail()).toBe(true);
    });

    it('el mensaje de error incluye la moneda inválida', () => {
      const result = PresupuestoEntity.create(makeProps({ moneda: 'BRL' }));
      expect(result.getError().message).toContain('BRL');
    });
  });

  describe('create() — valor por defecto de seleccionado', () => {
    it('seleccionado es false por defecto al crear un presupuesto nuevo', () => {
      const result = PresupuestoEntity.create(makeProps({ seleccionado: false }));
      expect(result.getValue().seleccionado).toBe(false);
    });
  });

  describe('create() — propiedades', () => {
    it('genera UUIDv7 como id si no se provee', () => {
      const result = PresupuestoEntity.create(makeProps());
      expect(result.getValue().id).toMatch(UUID_REGEX);
    });

    it('usa el id provisto si se pasa', () => {
      const id = 'pres-fixed-0000-7000-a000-000000000099';
      const result = PresupuestoEntity.create(makeProps(), id);
      expect(result.getValue().id).toBe(id);
    });

    it('expone todos los getters correctamente', () => {
      const fecha = new Date('2026-05-15');
      const pres = PresupuestoEntity.create(
        makeProps({
          ticketCompraId: 'tc-xyz',
          proveedor: 'Global Supply',
          montoTotal: 99999.99,
          moneda: 'USD',
          fechaCotizacion: fecha,
          observaciones: 'Incluye IVA',
        }),
      ).getValue();

      expect(pres.ticketCompraId).toBe('tc-xyz');
      expect(pres.proveedor).toBe('Global Supply');
      expect(pres.montoTotal).toBe(99999.99);
      expect(pres.moneda).toBe('USD');
      expect(pres.fechaCotizacion).toBe(fecha);
      expect(pres.seleccionado).toBe(false);
      expect(pres.observaciones).toBe('Incluye IVA');
    });

    it('acepta observaciones null', () => {
      const pres = PresupuestoEntity.create(makeProps({ observaciones: null })).getValue();
      expect(pres.observaciones).toBeNull();
    });
  });

  describe('seleccionar() / deseleccionar()', () => {
    it('seleccionar() setea seleccionado = true', () => {
      const pres = PresupuestoEntity.create(makeProps()).getValue();
      expect(pres.seleccionado).toBe(false);
      pres.seleccionar();
      expect(pres.seleccionado).toBe(true);
    });

    it('deseleccionar() setea seleccionado = false', () => {
      const pres = PresupuestoEntity.create(makeProps({ seleccionado: true })).getValue();
      pres.deseleccionar();
      expect(pres.seleccionado).toBe(false);
    });

    it('seleccionar() es idempotente', () => {
      const pres = PresupuestoEntity.create(makeProps()).getValue();
      pres.seleccionar();
      pres.seleccionar();
      expect(pres.seleccionado).toBe(true);
    });
  });

  describe('softDelete()', () => {
    it('marca el presupuesto como soft-deleted', () => {
      const pres = PresupuestoEntity.create(makeProps()).getValue();
      expect(pres.isDeleted()).toBe(false);
      pres.softDelete();
      expect(pres.isDeleted()).toBe(true);
      expect(pres.deletedAt).toBeInstanceOf(Date);
    });
  });

  describe('reconstitute()', () => {
    it('preserva todos los campos al reconstituir desde persistencia', () => {
      const createdAt = new Date('2026-04-01T10:00:00Z');
      const updatedAt = new Date('2026-04-02T10:00:00Z');
      const deletedAt = new Date('2026-04-03T10:00:00Z');
      const fecha = new Date('2026-04-01');

      const pres = PresupuestoEntity.reconstitute(
        {
          ticketCompraId: 'tc-reconstituido',
          proveedor: 'Proveedor Reconst.',
          montoTotal: 12345.67,
          moneda: 'USD',
          fechaCotizacion: fecha,
          seleccionado: true,
          observaciones: 'Observación reconstituida',
        },
        'pres-reconst-id',
        createdAt,
        updatedAt,
        deletedAt,
      );

      expect(pres.id).toBe('pres-reconst-id');
      expect(pres.proveedor).toBe('Proveedor Reconst.');
      expect(pres.montoTotal).toBe(12345.67);
      expect(pres.moneda).toBe('USD');
      expect(pres.seleccionado).toBe(true);
      expect(pres.createdAt).toBe(createdAt);
      expect(pres.updatedAt).toBe(updatedAt);
      expect(pres.deletedAt).toBe(deletedAt);
      expect(pres.isDeleted()).toBe(true);
    });

    it('reconstitute con deletedAt null → isDeleted() false', () => {
      const pres = PresupuestoEntity.reconstitute(
        makeProps(),
        'pres-active',
        new Date(),
        new Date(),
        null,
      );
      expect(pres.isDeleted()).toBe(false);
    });
  });
});
