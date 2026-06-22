/**
 * 2.A.1 TEST — Unit tests de RoleEntity (RED → GREEN con 2.A.2)
 *
 * Cubre:
 * - Construcción con datos válidos
 * - Lista de permisos vacía al crear
 * - addPermiso(): agrega permisos al role
 * - addPermiso(): no duplica permisos con mismo id
 * - Getters de dominio
 */
import { RoleEntity } from './role.entity';
import { PermisoEntity } from './permiso.entity';

const makePermiso = (codigo: string, id?: string) =>
  PermisoEntity.create({ codigo, descripcion: null }, id);

const makeRole = (overrides: Partial<Parameters<typeof RoleEntity.create>[0]> = {}) =>
  RoleEntity.create({
    codigo: 'SOPORTE_IT',
    nombre: 'Soporte IT',
    descripcion: null,
    permisos: [],
    ...overrides,
  });

describe('RoleEntity', () => {
  describe('create()', () => {
    it('crea un role con datos válidos', () => {
      const role = makeRole();
      expect(role).toBeInstanceOf(RoleEntity);
      expect(role.codigo).toBe('SOPORTE_IT');
    });

    it('asigna UUIDv7 al crear', () => {
      const role = makeRole();
      expect(role.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it('inicia con lista de permisos vacía si no se proveen', () => {
      const role = makeRole({ permisos: [] });
      expect(role.permisos).toHaveLength(0);
    });

    it('acepta lista de permisos inicial', () => {
      const p1 = makePermiso('ticket:crear');
      const role = makeRole({ permisos: [p1] });
      expect(role.permisos).toHaveLength(1);
    });

    it('genera IDs únicos entre instancias', () => {
      const a = makeRole();
      const b = makeRole();
      expect(a.id).not.toBe(b.id);
    });
  });

  describe('addPermiso()', () => {
    it('agrega un permiso al role', () => {
      const role = makeRole();
      const permiso = makePermiso('ticket:crear');
      role.addPermiso(permiso);
      expect(role.permisos).toHaveLength(1);
      expect(role.permisos[0].codigo).toBe('ticket:crear');
    });

    it('agrega múltiples permisos distintos', () => {
      const role = makeRole();
      role.addPermiso(makePermiso('ticket:crear'));
      role.addPermiso(makePermiso('ticket:cerrar'));
      expect(role.permisos).toHaveLength(2);
    });

    it('no duplica permisos con el mismo id', () => {
      const role = makeRole();
      const fixedId = '01966a6a-0000-7000-8000-000000000001';
      const permiso = makePermiso('ticket:crear', fixedId);
      role.addPermiso(permiso);
      role.addPermiso(permiso); // mismo id → no debe duplicar
      expect(role.permisos).toHaveLength(1);
    });

    it('no duplica aunque se cree una instancia distinta con el mismo id', () => {
      const role = makeRole();
      const id = '01966a6a-0000-7000-8000-000000000002';
      role.addPermiso(makePermiso('ticket:crear', id));
      role.addPermiso(makePermiso('ticket:crear', id)); // mismo id, instancia distinta
      expect(role.permisos).toHaveLength(1);
    });
  });

  describe('reconstitute()', () => {
    it('reconstruye un role con permisos desde persistencia', () => {
      const permisos = [makePermiso('ticket:crear'), makePermiso('compra:gestionar')];
      const role = RoleEntity.reconstitute(
        { codigo: 'ADMIN', nombre: 'Administrador', descripcion: null, permisos },
        'role-uuid',
        new Date('2025-01-01T00:00:00Z'),
        new Date('2025-06-01T00:00:00Z'),
        null,
      );
      expect(role.id).toBe('role-uuid');
      expect(role.codigo).toBe('ADMIN');
      expect(role.permisos).toHaveLength(2);
    });

    it('preserva createdAt pasado como parámetro', () => {
      const createdAt = new Date('2025-01-15T10:00:00Z');
      const role = RoleEntity.reconstitute(
        { codigo: 'ADMIN', nombre: 'Administrador', descripcion: null, permisos: [] },
        'role-uuid',
        createdAt,
        new Date('2025-06-01T00:00:00Z'),
        null,
      );
      expect(role.createdAt.getTime()).toBe(createdAt.getTime());
    });

    it('preserva updatedAt pasado como parámetro', () => {
      const updatedAt = new Date('2025-09-01T12:00:00Z');
      const role = RoleEntity.reconstitute(
        { codigo: 'ADMIN', nombre: 'Administrador', descripcion: null, permisos: [] },
        'role-uuid',
        new Date('2025-01-01T00:00:00Z'),
        updatedAt,
        null,
      );
      expect(role.updatedAt.getTime()).toBe(updatedAt.getTime());
    });

    it('preserva deletedAt no-nulo → isDeleted() retorna true', () => {
      const deletedAt = new Date('2025-12-01T00:00:00Z');
      const role = RoleEntity.reconstitute(
        { codigo: 'ADMIN', nombre: 'Administrador', descripcion: null, permisos: [] },
        'role-uuid',
        new Date('2025-01-01T00:00:00Z'),
        new Date('2025-12-01T00:00:00Z'),
        deletedAt,
      );
      expect(role.deletedAt?.getTime()).toBe(deletedAt.getTime());
      expect(role.isDeleted()).toBe(true);
    });

    it('preserva deletedAt nulo → isDeleted() retorna false', () => {
      const role = RoleEntity.reconstitute(
        { codigo: 'ADMIN', nombre: 'Administrador', descripcion: null, permisos: [] },
        'role-uuid',
        new Date('2025-01-01T00:00:00Z'),
        new Date('2025-01-01T00:00:00Z'),
        null,
      );
      expect(role.deletedAt).toBeNull();
      expect(role.isDeleted()).toBe(false);
    });
  });

  describe('Getters de dominio', () => {
    it('expone codigo', () => {
      expect(makeRole({ codigo: 'ADMIN' }).codigo).toBe('ADMIN');
    });

    it('expone nombre', () => {
      expect(makeRole({ nombre: 'Administrador' }).nombre).toBe('Administrador');
    });

    it('expone descripcion (nullable)', () => {
      expect(makeRole({ descripcion: 'Rol admin' }).descripcion).toBe('Rol admin');
      expect(makeRole({ descripcion: null }).descripcion).toBeNull();
    });

    it('expone permisos como array', () => {
      const role = makeRole({ permisos: [makePermiso('ticket:crear')] });
      expect(Array.isArray(role.permisos)).toBe(true);
      expect(role.permisos).toHaveLength(1);
    });
  });
});
