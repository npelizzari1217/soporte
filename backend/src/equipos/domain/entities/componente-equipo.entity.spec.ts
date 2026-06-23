/**
 * 6.A.1 TEST — Unit tests de ComponenteEquipoEntity (RED → GREEN con 6.A.2)
 *
 * Cubre:
 * - tipo_componente_id REQUERIDO: create() lanza error si está vacío
 * - Creación correcta con todos los campos
 * - Campos opcionales aceptan null
 * - reconstitute(): preserva todos los campos
 */
import { ComponenteEquipoEntity, ComponenteEquipoProps } from './componente-equipo.entity';
import { TipoComponenteIdRequeridoError } from '../errors/equipos.errors';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const makeProps = (overrides: Partial<ComponenteEquipoProps> = {}): ComponenteEquipoProps => ({
  equipoId: 'equipo-uuid',
  tipoComponenteId: 'tipo-comp-uuid',
  descripcion: null,
  numeroSerie: null,
  capacidad: null,
  ...overrides,
});

describe('ComponenteEquipoEntity', () => {
  describe('create()', () => {
    it('genera un UUIDv7 como id si no se provee', () => {
      const c = ComponenteEquipoEntity.create(makeProps());
      expect(c.id).toMatch(UUID_REGEX);
    });

    it('usa el id provisto si se pasa explícitamente', () => {
      const id = 'b2b2b2b2-0000-7000-b000-000000000002';
      const c = ComponenteEquipoEntity.create(makeProps(), id);
      expect(c.id).toBe(id);
    });

    it('expone todas las propiedades esperadas', () => {
      const props = makeProps({
        equipoId: 'eq-uuid-001',
        tipoComponenteId: 'tipo-ram-uuid',
        descripcion: '16GB DDR4 3200MHz',
        numeroSerie: 'RAM-SN-001',
        capacidad: '16GB',
      });
      const c = ComponenteEquipoEntity.create(props);

      expect(c.equipoId).toBe('eq-uuid-001');
      expect(c.tipoComponenteId).toBe('tipo-ram-uuid');
      expect(c.descripcion).toBe('16GB DDR4 3200MHz');
      expect(c.numeroSerie).toBe('RAM-SN-001');
      expect(c.capacidad).toBe('16GB');
    });

    it('acepta descripcion null', () => {
      const c = ComponenteEquipoEntity.create(makeProps({ descripcion: null }));
      expect(c.descripcion).toBeNull();
    });

    it('acepta numeroSerie null', () => {
      const c = ComponenteEquipoEntity.create(makeProps({ numeroSerie: null }));
      expect(c.numeroSerie).toBeNull();
    });

    it('acepta capacidad null', () => {
      const c = ComponenteEquipoEntity.create(makeProps({ capacidad: null }));
      expect(c.capacidad).toBeNull();
    });

    it('deletedAt es null al crear', () => {
      const c = ComponenteEquipoEntity.create(makeProps());
      expect(c.deletedAt).toBeNull();
      expect(c.isDeleted()).toBe(false);
    });

    // ─── Validación de tipo_componente_id REQUERIDO ─────────────────────────

    it('lanza TipoComponenteIdRequeridoError cuando tipoComponenteId está vacío', () => {
      expect(() => ComponenteEquipoEntity.create(makeProps({ tipoComponenteId: '' }))).toThrow(
        TipoComponenteIdRequeridoError,
      );
    });

    it('el error es de tipo TipoComponenteIdRequeridoError (instanceof)', () => {
      expect(() => ComponenteEquipoEntity.create(makeProps({ tipoComponenteId: '' }))).toThrow(
        TipoComponenteIdRequeridoError,
      );
    });

    it('múltiples componentes del mismo tipo para el mismo equipo son válidos', () => {
      // El spec permite múltiples instancias del mismo tipo (ej. 2 módulos RAM)
      const props = makeProps({ tipoComponenteId: 'tipo-ram-uuid', equipoId: 'equipo-01' });
      const c1 = ComponenteEquipoEntity.create(props);
      const c2 = ComponenteEquipoEntity.create(props);
      expect(c1.id).not.toBe(c2.id);
      expect(c1.tipoComponenteId).toBe(c2.tipoComponenteId);
      expect(c1.equipoId).toBe(c2.equipoId);
    });
  });

  describe('softDelete() (heredado de BaseEntity)', () => {
    it('setea deletedAt y marca isDeleted() = true', () => {
      const c = ComponenteEquipoEntity.create(makeProps());
      c.softDelete();
      expect(c.isDeleted()).toBe(true);
      expect(c.deletedAt).toBeInstanceOf(Date);
    });
  });

  describe('reconstitute()', () => {
    it('preserva todos los campos al reconstituir desde persistencia', () => {
      const createdAt = new Date('2026-01-01T10:00:00Z');
      const updatedAt = new Date('2026-01-02T10:00:00Z');
      const deletedAt = new Date('2026-01-03T10:00:00Z');

      const c = ComponenteEquipoEntity.reconstitute(
        {
          equipoId: 'equipo-uuid-persisted',
          tipoComponenteId: 'tipo-cpu-uuid',
          descripcion: 'Intel Core i7-12700',
          numeroSerie: 'CPU-SN-INTEL-001',
          capacidad: null,
        },
        'componente-id-fijo',
        createdAt,
        updatedAt,
        deletedAt,
      );

      expect(c.equipoId).toBe('equipo-uuid-persisted');
      expect(c.tipoComponenteId).toBe('tipo-cpu-uuid');
      expect(c.descripcion).toBe('Intel Core i7-12700');
      expect(c.numeroSerie).toBe('CPU-SN-INTEL-001');
      expect(c.capacidad).toBeNull();
      expect(c.createdAt).toBe(createdAt);
      expect(c.updatedAt).toBe(updatedAt);
      expect(c.deletedAt).toBe(deletedAt);
      expect(c.isDeleted()).toBe(true);
    });

    it('reconstitute con deletedAt null → isDeleted() = false', () => {
      const c = ComponenteEquipoEntity.reconstitute(
        makeProps(),
        'componente-activo-id',
        new Date(),
        new Date(),
        null,
      );
      expect(c.isDeleted()).toBe(false);
    });
  });
});
