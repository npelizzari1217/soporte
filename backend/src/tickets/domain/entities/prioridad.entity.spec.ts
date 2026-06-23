/**
 * Unit tests de PrioridadEntity.
 *
 * Cubre:
 * - create(): generación de UUIDv7, getters, deletedAt=null
 * - reconstitute(): hidratación completa de timestamps (ruta crítica de CrearTicketUseCase en PR-11)
 * - Soft-delete heredado de BaseEntity
 */
import { PrioridadEntity, PrioridadProps } from './prioridad.entity';

const makePrioridadProps = (overrides: Partial<PrioridadProps> = {}): PrioridadProps => ({
  codigo: 'MEDIA',
  nombre: 'Media',
  color: '#F59E0B',
  orden: 2,
  activo: true,
  ...overrides,
});

describe('PrioridadEntity', () => {
  describe('create()', () => {
    it('genera un id UUIDv7 cuando no se provee', () => {
      const prioridad = PrioridadEntity.create(makePrioridadProps());
      expect(prioridad.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it('usa el id provisto cuando se da uno explícito', () => {
      const id = '01966a6a-0000-7000-8000-000000000040';
      const prioridad = PrioridadEntity.create(makePrioridadProps(), id);
      expect(prioridad.id).toBe(id);
    });

    it('deletedAt es null al crear', () => {
      const prioridad = PrioridadEntity.create(makePrioridadProps());
      expect(prioridad.deletedAt).toBeNull();
      expect(prioridad.isDeleted()).toBe(false);
    });

    it('expone los getters correctamente', () => {
      const props = makePrioridadProps();
      const prioridad = PrioridadEntity.create(props);
      expect(prioridad.codigo).toBe('MEDIA');
      expect(prioridad.nombre).toBe('Media');
      expect(prioridad.color).toBe('#F59E0B');
      expect(prioridad.orden).toBe(2);
      expect(prioridad.activo).toBe(true);
    });

    it('acepta color null (prioridades sin color asignado)', () => {
      const prioridad = PrioridadEntity.create(makePrioridadProps({ color: null }));
      expect(prioridad.color).toBeNull();
    });

    it('acepta activo false (prioridades desactivadas del catálogo)', () => {
      const prioridad = PrioridadEntity.create(makePrioridadProps({ activo: false }));
      expect(prioridad.activo).toBe(false);
    });

    it('genera IDs distintos para dos instancias', () => {
      const a = PrioridadEntity.create(makePrioridadProps());
      const b = PrioridadEntity.create(makePrioridadProps());
      expect(a.id).not.toBe(b.id);
    });
  });

  describe('reconstitute()', () => {
    it('preserva todos los timestamps desde la DB (ruta crítica del mapper de PR-11)', () => {
      const createdAt = new Date('2026-01-15T08:00:00.000Z');
      const updatedAt = new Date('2026-06-01T12:00:00.000Z');

      const prioridad = PrioridadEntity.reconstitute(
        makePrioridadProps({ codigo: 'ALTA', nombre: 'Alta', orden: 3, color: '#EF4444' }),
        '01966a6a-0000-7000-8000-000000000041',
        createdAt,
        updatedAt,
        null,
      );

      expect(prioridad.id).toBe('01966a6a-0000-7000-8000-000000000041');
      expect(prioridad.codigo).toBe('ALTA');
      expect(prioridad.createdAt.getTime()).toBe(createdAt.getTime());
      expect(prioridad.updatedAt.getTime()).toBe(updatedAt.getTime());
      expect(prioridad.deletedAt).toBeNull();
    });

    it('hidrata deletedAt cuando la prioridad fue soft-deleted', () => {
      const deletedAt = new Date('2026-05-01T00:00:00.000Z');
      const prioridad = PrioridadEntity.reconstitute(
        makePrioridadProps({ activo: false }),
        '01966a6a-0000-7000-8000-000000000042',
        new Date('2026-01-01'),
        new Date('2026-05-01'),
        deletedAt,
      );
      expect(prioridad.isDeleted()).toBe(true);
      expect(prioridad.deletedAt?.getTime()).toBe(deletedAt.getTime());
    });

    it('reconstitute preserva todos los getters del catálogo', () => {
      const props = makePrioridadProps({
        codigo: 'CRITICA',
        nombre: 'Crítica',
        orden: 4,
        color: '#DC2626',
      });
      const prioridad = PrioridadEntity.reconstitute(
        props,
        '01966a6a-0000-7000-8000-000000000043',
        new Date(),
        new Date(),
        null,
      );
      expect(prioridad.codigo).toBe('CRITICA');
      expect(prioridad.nombre).toBe('Crítica');
      expect(prioridad.orden).toBe(4);
      expect(prioridad.color).toBe('#DC2626');
      expect(prioridad.activo).toBe(true);
    });
  });

  describe('softDelete() (herencia BaseEntity)', () => {
    it('marca la prioridad como eliminada', () => {
      const prioridad = PrioridadEntity.create(makePrioridadProps());
      expect(prioridad.isDeleted()).toBe(false);
      prioridad.softDelete();
      expect(prioridad.isDeleted()).toBe(true);
      expect(prioridad.deletedAt).not.toBeNull();
    });
  });
});
