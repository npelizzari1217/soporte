/**
 * Unit tests de EstadoEntity.
 *
 * Cubre:
 * - create(): generación de UUIDv7, getters, deletedAt=null
 * - reconstitute(): hidratación completa de timestamps (ruta crítica de CrearTicketUseCase en PR-11)
 * - Soft-delete heredado de BaseEntity
 */
import { EstadoEntity, EstadoProps } from './estado.entity';

const makeEstadoProps = (overrides: Partial<EstadoProps> = {}): EstadoProps => ({
  codigo: 'ABIERTO',
  nombre: 'Abierto',
  color: '#3B82F6',
  orden: 1,
  activo: true,
  ...overrides,
});

describe('EstadoEntity', () => {
  describe('create()', () => {
    it('genera un id UUIDv7 cuando no se provee', () => {
      const estado = EstadoEntity.create(makeEstadoProps());
      expect(estado.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it('usa el id provisto cuando se da uno explícito', () => {
      const id = '01966a6a-0000-7000-8000-000000000030';
      const estado = EstadoEntity.create(makeEstadoProps(), id);
      expect(estado.id).toBe(id);
    });

    it('deletedAt es null al crear', () => {
      const estado = EstadoEntity.create(makeEstadoProps());
      expect(estado.deletedAt).toBeNull();
      expect(estado.isDeleted()).toBe(false);
    });

    it('expone los getters correctamente', () => {
      const props = makeEstadoProps();
      const estado = EstadoEntity.create(props);
      expect(estado.codigo).toBe('ABIERTO');
      expect(estado.nombre).toBe('Abierto');
      expect(estado.color).toBe('#3B82F6');
      expect(estado.orden).toBe(1);
      expect(estado.activo).toBe(true);
    });

    it('acepta color null (estados sin color asignado)', () => {
      const estado = EstadoEntity.create(makeEstadoProps({ color: null }));
      expect(estado.color).toBeNull();
    });

    it('acepta activo false (estados desactivados del catálogo)', () => {
      const estado = EstadoEntity.create(makeEstadoProps({ activo: false }));
      expect(estado.activo).toBe(false);
    });
  });

  describe('reconstitute()', () => {
    it('preserva todos los timestamps desde la DB (ruta crítica del mapper de PR-11)', () => {
      const createdAt = new Date('2026-01-15T08:00:00.000Z');
      const updatedAt = new Date('2026-06-01T12:00:00.000Z');

      const estado = EstadoEntity.reconstitute(
        makeEstadoProps({ codigo: 'EN_PROGRESO', nombre: 'En progreso', orden: 2 }),
        '01966a6a-0000-7000-8000-000000000031',
        createdAt,
        updatedAt,
        null,
      );

      expect(estado.id).toBe('01966a6a-0000-7000-8000-000000000031');
      expect(estado.codigo).toBe('EN_PROGRESO');
      expect(estado.createdAt.getTime()).toBe(createdAt.getTime());
      expect(estado.updatedAt.getTime()).toBe(updatedAt.getTime());
      expect(estado.deletedAt).toBeNull();
    });

    it('hidrata deletedAt cuando el estado fue soft-deleted', () => {
      const deletedAt = new Date('2026-05-01T00:00:00.000Z');
      const estado = EstadoEntity.reconstitute(
        makeEstadoProps({ activo: false }),
        '01966a6a-0000-7000-8000-000000000032',
        new Date('2026-01-01'),
        new Date('2026-05-01'),
        deletedAt,
      );
      expect(estado.isDeleted()).toBe(true);
      expect(estado.deletedAt?.getTime()).toBe(deletedAt.getTime());
    });

    it('reconstitute preserva todos los getters del catálogo', () => {
      const props = makeEstadoProps({
        codigo: 'CERRADO',
        nombre: 'Cerrado',
        orden: 5,
        color: '#EF4444',
      });
      const estado = EstadoEntity.reconstitute(
        props,
        '01966a6a-0000-7000-8000-000000000033',
        new Date(),
        new Date(),
        null,
      );
      expect(estado.codigo).toBe('CERRADO');
      expect(estado.nombre).toBe('Cerrado');
      expect(estado.orden).toBe(5);
      expect(estado.color).toBe('#EF4444');
      expect(estado.activo).toBe(true);
    });
  });

  describe('softDelete() (herencia BaseEntity)', () => {
    it('marca el estado como eliminado', () => {
      const estado = EstadoEntity.create(makeEstadoProps());
      expect(estado.isDeleted()).toBe(false);
      estado.softDelete();
      expect(estado.isDeleted()).toBe(true);
      expect(estado.deletedAt).not.toBeNull();
    });
  });
});
