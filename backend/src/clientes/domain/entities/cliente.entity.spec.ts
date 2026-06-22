/**
 * 1.A.1 TEST — Unit tests de ClienteEntity (RED → GREEN con 1.A.2)
 *
 * Cubre:
 * - Herencia de BaseEntity: id UUIDv7, timestamps, deletedAt=null
 * - Getters de propiedades del dominio
 * - suspend(): activo=false + softDelete (deletedAt seteado)
 * - reactivate(): activo=true + deletedAt=null
 * - IDs únicos entre instancias
 */
import { ClienteEntity } from './cliente.entity';

const makeCliente = (overrides: Partial<Parameters<(typeof ClienteEntity)['create']>[0]> = {}) =>
  ClienteEntity.create({
    nombre: 'Acme Corp',
    razonSocial: 'Acme S.A.',
    cuit: '20123456789',
    dbName: 'soporte_acme',
    activo: true,
    ...overrides,
  });

describe('ClienteEntity', () => {
  describe('Construcción (BaseEntity heredado)', () => {
    it('genera un id UUIDv7 cuando no se provee', () => {
      const cliente = makeCliente();
      // UUID v7 format: 8-4-4-4-12 con version bit 7 en tercer segmento
      expect(cliente.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it('usa el id provisto cuando se da uno explícito', () => {
      const id = '01966a6a-0000-7000-8000-000000000001';
      const cliente = ClienteEntity.create(
        { nombre: 'X', razonSocial: null, cuit: null, dbName: 'x_db', activo: true },
        id,
      );
      expect(cliente.id).toBe(id);
    });

    it('setea createdAt y updatedAt a la fecha de creación', () => {
      const before = new Date();
      const cliente = makeCliente();
      const after = new Date();
      expect(cliente.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(cliente.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
      expect(cliente.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });

    it('deletedAt es null al crear', () => {
      const cliente = makeCliente();
      expect(cliente.deletedAt).toBeNull();
      expect(cliente.isDeleted()).toBe(false);
    });

    it('genera IDs distintos para instancias creadas consecutivamente', () => {
      const a = makeCliente();
      const b = makeCliente();
      expect(a.id).not.toBe(b.id);
    });
  });

  describe('Getters de dominio', () => {
    it('expone nombre', () => {
      const c = makeCliente({ nombre: 'Beta Inc' });
      expect(c.nombre).toBe('Beta Inc');
    });

    it('expone razonSocial (nullable)', () => {
      expect(makeCliente({ razonSocial: 'Beta S.R.L.' }).razonSocial).toBe('Beta S.R.L.');
      expect(makeCliente({ razonSocial: null }).razonSocial).toBeNull();
    });

    it('expone cuit (nullable)', () => {
      expect(makeCliente({ cuit: '30123456780' }).cuit).toBe('30123456780');
      expect(makeCliente({ cuit: null }).cuit).toBeNull();
    });

    it('expone dbName', () => {
      expect(makeCliente({ dbName: 'soporte_beta' }).dbName).toBe('soporte_beta');
    });

    it('expone activo=true por defecto', () => {
      expect(makeCliente().activo).toBe(true);
    });
  });

  describe('suspend()', () => {
    it('setea activo=false', () => {
      const cliente = makeCliente();
      cliente.suspend();
      expect(cliente.activo).toBe(false);
    });

    it('setea deletedAt (soft delete) al momento de la suspensión', () => {
      const cliente = makeCliente();
      const before = new Date();
      cliente.suspend();
      const after = new Date();
      expect(cliente.deletedAt).not.toBeNull();
      expect(cliente.deletedAt!.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(cliente.deletedAt!.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('isDeleted() retorna true después de suspend()', () => {
      const cliente = makeCliente();
      cliente.suspend();
      expect(cliente.isDeleted()).toBe(true);
    });
  });

  describe('reactivate()', () => {
    it('setea activo=true', () => {
      const cliente = makeCliente();
      cliente.suspend();
      cliente.reactivate();
      expect(cliente.activo).toBe(true);
    });

    it('limpia deletedAt (null después de reactivar)', () => {
      const cliente = makeCliente();
      cliente.suspend();
      cliente.reactivate();
      expect(cliente.deletedAt).toBeNull();
      expect(cliente.isDeleted()).toBe(false);
    });
  });
});
