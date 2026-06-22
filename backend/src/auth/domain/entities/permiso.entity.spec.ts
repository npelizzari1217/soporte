/**
 * 2.A.1 TEST — Unit tests de PermisoEntity (RED → GREEN con 2.A.2)
 *
 * Cubre:
 * - Construcción con código "recurso:accion" válido
 * - ID UUIDv7 asignado automáticamente
 * - Validación del formato de código (rechaza código sin ":")
 * - Getters de dominio
 */
import { PermisoEntity } from './permiso.entity';
import { PermisoCodigoInvalidoError } from '../errors/auth.errors';

describe('PermisoEntity', () => {
  describe('create()', () => {
    it('crea un permiso con código válido "recurso:accion"', () => {
      const permiso = PermisoEntity.create({ codigo: 'ticket:crear', descripcion: null });
      expect(permiso).toBeInstanceOf(PermisoEntity);
      expect(permiso.codigo).toBe('ticket:crear');
    });

    it('asigna un UUIDv7 al crear', () => {
      const permiso = PermisoEntity.create({ codigo: 'ticket:crear', descripcion: null });
      expect(permiso.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it('acepta un id externo si se provee', () => {
      const id = '01966a6a-0000-7000-8000-000000000099';
      const permiso = PermisoEntity.create({ codigo: 'compra:aprobar', descripcion: null }, id);
      expect(permiso.id).toBe(id);
    });

    it('lanza PermisoCodigoInvalidoError si el código no contiene ":"', () => {
      expect(() => PermisoEntity.create({ codigo: 'ticket', descripcion: null })).toThrow(
        PermisoCodigoInvalidoError,
      );
    });

    it('lanza PermisoCodigoInvalidoError si el código está vacío', () => {
      expect(() => PermisoEntity.create({ codigo: '', descripcion: null })).toThrow(
        PermisoCodigoInvalidoError,
      );
    });

    it('lanza PermisoCodigoInvalidoError si el código tiene ":" al inicio', () => {
      expect(() => PermisoEntity.create({ codigo: ':accion', descripcion: null })).toThrow(
        PermisoCodigoInvalidoError,
      );
    });

    it('lanza PermisoCodigoInvalidoError si el código tiene ":" al final', () => {
      expect(() => PermisoEntity.create({ codigo: 'recurso:', descripcion: null })).toThrow(
        PermisoCodigoInvalidoError,
      );
    });
  });

  describe('reconstitute()', () => {
    it('reconstruye un permiso desde persistencia sin validar formato', () => {
      const permiso = PermisoEntity.reconstitute(
        { codigo: 'equipo:gestionar', descripcion: 'Gestionar equipos' },
        'some-uuid',
      );
      expect(permiso.id).toBe('some-uuid');
      expect(permiso.codigo).toBe('equipo:gestionar');
      expect(permiso.descripcion).toBe('Gestionar equipos');
    });
  });

  describe('Getters de dominio', () => {
    it('expone codigo', () => {
      const permiso = PermisoEntity.create({ codigo: 'rol:asignar', descripcion: null });
      expect(permiso.codigo).toBe('rol:asignar');
    });

    it('expone descripcion (nullable)', () => {
      const con = PermisoEntity.create({ codigo: 'ticket:ver_todos', descripcion: 'Ver todos' });
      const sin = PermisoEntity.create({ codigo: 'ticket:cerrar', descripcion: null });
      expect(con.descripcion).toBe('Ver todos');
      expect(sin.descripcion).toBeNull();
    });

    it('IDs distintos entre instancias creadas consecutivamente', () => {
      const a = PermisoEntity.create({ codigo: 'ticket:crear', descripcion: null });
      const b = PermisoEntity.create({ codigo: 'ticket:crear', descripcion: null });
      expect(a.id).not.toBe(b.id);
    });
  });
});
