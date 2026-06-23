import { UbicacionEntity } from './ubicacion.entity';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('UbicacionEntity', () => {
  const NOMBRE = 'Edificio Central';

  describe('create()', () => {
    it('genera un UUIDv7 como id si no se provee', () => {
      const u = UbicacionEntity.create({ nombre: NOMBRE });
      expect(u.id).toMatch(UUID_REGEX);
    });

    it('usa el id provisto si se pasa explícitamente', () => {
      const id = 'a1a1a1a1-0000-7000-a000-000000000001';
      const u = UbicacionEntity.create({ nombre: NOMBRE }, id);
      expect(u.id).toBe(id);
    });

    it('almacena el nombre correctamente', () => {
      const u = UbicacionEntity.create({ nombre: NOMBRE });
      expect(u.nombre).toBe(NOMBRE);
    });

    it('padre_id es null por defecto (nodo raíz)', () => {
      const u = UbicacionEntity.create({ nombre: NOMBRE });
      expect(u.padreId).toBeNull();
    });

    it('acepta padre_id para sub-ubicaciones', () => {
      const padreId = 'b2b2b2b2-0000-7000-a000-000000000002';
      const u = UbicacionEntity.create({ nombre: 'Piso 3', padreId });
      expect(u.padreId).toBe(padreId);
    });

    it('activo es true por defecto', () => {
      const u = UbicacionEntity.create({ nombre: NOMBRE });
      expect(u.activo).toBe(true);
    });

    it('descripcion es null por defecto', () => {
      const u = UbicacionEntity.create({ nombre: NOMBRE });
      expect(u.descripcion).toBeNull();
    });

    it('acepta descripcion cuando se provee', () => {
      const u = UbicacionEntity.create({ nombre: NOMBRE, descripcion: 'Detalle del espacio' });
      expect(u.descripcion).toBe('Detalle del espacio');
    });

    it('no está soft-deleted al crear', () => {
      const u = UbicacionEntity.create({ nombre: NOMBRE });
      expect(u.isDeleted()).toBe(false);
      expect(u.deletedAt).toBeNull();
    });
  });

  describe('softDelete()', () => {
    it('setea deletedAt y marca isDeleted() = true', () => {
      const u = UbicacionEntity.create({ nombre: NOMBRE });
      u.softDelete();
      expect(u.isDeleted()).toBe(true);
      expect(u.deletedAt).toBeInstanceOf(Date);
    });
  });

  describe('reconstitute()', () => {
    it('preserva todos los campos al reconstituir desde persistencia', () => {
      const padreId = 'c3c3c3c3-0000-7000-a000-000000000003';
      const createdAt = new Date('2026-01-01T10:00:00Z');
      const updatedAt = new Date('2026-01-02T10:00:00Z');
      const deletedAt = new Date('2026-01-03T10:00:00Z');

      const u = UbicacionEntity.reconstitute(
        {
          nombre: 'Sala de Servidores',
          descripcion: 'Piso 3, ala norte',
          padreId,
          activo: false,
        },
        'd4d4d4d4-0000-7000-a000-000000000004',
        createdAt,
        updatedAt,
        deletedAt,
      );

      expect(u.nombre).toBe('Sala de Servidores');
      expect(u.descripcion).toBe('Piso 3, ala norte');
      expect(u.padreId).toBe(padreId);
      expect(u.activo).toBe(false);
      expect(u.createdAt).toBe(createdAt);
      expect(u.updatedAt).toBe(updatedAt);
      expect(u.deletedAt).toBe(deletedAt);
      expect(u.isDeleted()).toBe(true);
    });

    it('reconstitute con deletedAt null → isDeleted() false', () => {
      const u = UbicacionEntity.reconstitute(
        { nombre: NOMBRE, padreId: null, descripcion: null, activo: true },
        'id-fixed',
        new Date(),
        new Date(),
        null,
      );
      expect(u.isDeleted()).toBe(false);
    });
  });
});
