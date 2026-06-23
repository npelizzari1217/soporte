/**
 * 6.A.1 TEST — Unit tests de EquipoInformaticoEntity (RED → GREEN con 6.A.2)
 *
 * Cubre:
 * - Herencia de BaseEntity: id UUIDv7, timestamps, deletedAt=null
 * - activo = true por defecto al crear
 * - deactivate(): setea activo=false SIN tocar deletedAt (distinto de soft-delete)
 * - softDelete() (BaseEntity): setea deletedAt, activo NO se modifica
 * - asignado_a_id es soft ref (solo string|null, sin validación de FK en dominio)
 * - reconstitute(): preserva todos los campos desde persistencia
 */
import { EquipoInformaticoEntity, EquipoInformaticoProps } from './equipo-informatico.entity';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const makeProps = (overrides: Partial<EquipoInformaticoProps> = {}): EquipoInformaticoProps => ({
  nombre: 'PC Contabilidad 01',
  numeroSerie: null,
  marca: null,
  modelo: null,
  fechaAdquisicion: null,
  ubicacionId: null,
  asignadoAId: null,
  activo: true,
  ...overrides,
});

describe('EquipoInformaticoEntity', () => {
  describe('create()', () => {
    it('genera un UUIDv7 como id si no se provee', () => {
      const e = EquipoInformaticoEntity.create(makeProps());
      expect(e.id).toMatch(UUID_REGEX);
    });

    it('usa el id provisto si se pasa explícitamente', () => {
      const id = 'a1a1a1a1-0000-7000-a000-000000000001';
      const e = EquipoInformaticoEntity.create(makeProps(), id);
      expect(e.id).toBe(id);
    });

    it('genera IDs distintos para instancias creadas consecutivamente', () => {
      const a = EquipoInformaticoEntity.create(makeProps());
      const b = EquipoInformaticoEntity.create(makeProps());
      expect(a.id).not.toBe(b.id);
    });

    it('activo es true por defecto al crear', () => {
      const e = EquipoInformaticoEntity.create(makeProps());
      expect(e.activo).toBe(true);
    });

    it('deletedAt es null al crear (no está soft-deleted)', () => {
      const e = EquipoInformaticoEntity.create(makeProps());
      expect(e.deletedAt).toBeNull();
      expect(e.isDeleted()).toBe(false);
    });

    it('expone las propiedades esperadas', () => {
      const props = makeProps({
        nombre: 'Laptop Desarrollo',
        numeroSerie: 'SN-DELL-001',
        marca: 'Dell',
        modelo: 'Latitude 5520',
        fechaAdquisicion: new Date('2024-01-15'),
        ubicacionId: 'ubicacion-uuid',
        asignadoAId: 'usuario-master-uuid',
      });
      const e = EquipoInformaticoEntity.create(props);

      expect(e.nombre).toBe('Laptop Desarrollo');
      expect(e.numeroSerie).toBe('SN-DELL-001');
      expect(e.marca).toBe('Dell');
      expect(e.modelo).toBe('Latitude 5520');
      expect(e.fechaAdquisicion).toEqual(new Date('2024-01-15'));
      expect(e.ubicacionId).toBe('ubicacion-uuid');
      expect(e.asignadoAId).toBe('usuario-master-uuid');
    });

    it('acepta numeroSerie null (equipo sin número de serie legible)', () => {
      const e = EquipoInformaticoEntity.create(makeProps({ numeroSerie: null }));
      expect(e.numeroSerie).toBeNull();
    });

    it('acepta ubicacionId null (equipo sin ubicación asignada)', () => {
      const e = EquipoInformaticoEntity.create(makeProps({ ubicacionId: null }));
      expect(e.ubicacionId).toBeNull();
    });

    it('asignado_a_id es null por defecto (soft ref, sin validación de FK en dominio)', () => {
      const e = EquipoInformaticoEntity.create(makeProps({ asignadoAId: null }));
      expect(e.asignadoAId).toBeNull();
    });

    it('asignado_a_id acepta un UUID sin validarlo contra master.usuarios (soft ref)', () => {
      // El dominio NO verifica que este UUID exista en master.usuarios.
      // Esa validación cross-DB ocurre en la capa de aplicación.
      const asignadoAId = 'usuario-master-uuid-que-no-existe-en-dominio';
      const e = EquipoInformaticoEntity.create(makeProps({ asignadoAId }));
      expect(e.asignadoAId).toBe(asignadoAId);
    });
  });

  describe('deactivate() — soft-deactivate (distinto de soft-delete)', () => {
    it('setea activo = false', () => {
      const e = EquipoInformaticoEntity.create(makeProps());
      expect(e.activo).toBe(true);
      e.deactivate();
      expect(e.activo).toBe(false);
    });

    it('NO setea deletedAt (deactivate ≠ softDelete)', () => {
      const e = EquipoInformaticoEntity.create(makeProps());
      e.deactivate();
      // Después de deactivate, el equipo sigue "existiendo" en la DB (deletedAt = null)
      // Solo se marca como inactivo (activo=false)
      expect(e.deletedAt).toBeNull();
      expect(e.isDeleted()).toBe(false);
    });

    it('un equipo puede estar inactivo (deactivate) Y no eliminado al mismo tiempo', () => {
      const e = EquipoInformaticoEntity.create(makeProps());
      e.deactivate();
      expect(e.activo).toBe(false);
      expect(e.isDeleted()).toBe(false);
    });
  });

  describe('softDelete() (heredado de BaseEntity) — distinto de deactivate()', () => {
    it('setea deletedAt y marca isDeleted() = true', () => {
      const e = EquipoInformaticoEntity.create(makeProps());
      e.softDelete();
      expect(e.isDeleted()).toBe(true);
      expect(e.deletedAt).toBeInstanceOf(Date);
    });

    it('softDelete NO modifica activo: activo puede quedar true después de softDelete', () => {
      // El soft-delete (deleted_at) y el estado activo son conceptos independientes.
      const e = EquipoInformaticoEntity.create(makeProps({ activo: true }));
      e.softDelete();
      // activo sigue siendo true — solo deleted_at fue modificado
      expect(e.activo).toBe(true);
      expect(e.isDeleted()).toBe(true);
    });
  });

  describe('reconstitute()', () => {
    it('preserva todos los campos al reconstituir desde persistencia', () => {
      const createdAt = new Date('2026-01-01T10:00:00Z');
      const updatedAt = new Date('2026-01-02T10:00:00Z');

      const e = EquipoInformaticoEntity.reconstitute(
        {
          nombre: 'Server Rack A',
          numeroSerie: 'SRV-001',
          marca: 'HP',
          modelo: 'ProLiant DL380',
          fechaAdquisicion: new Date('2023-06-01'),
          ubicacionId: 'sala-servidores-uuid',
          asignadoAId: null,
          activo: true,
        },
        'equipo-id-fijo',
        createdAt,
        updatedAt,
        null,
      );

      expect(e.nombre).toBe('Server Rack A');
      expect(e.numeroSerie).toBe('SRV-001');
      expect(e.marca).toBe('HP');
      expect(e.modelo).toBe('ProLiant DL380');
      expect(e.ubicacionId).toBe('sala-servidores-uuid');
      expect(e.asignadoAId).toBeNull();
      expect(e.activo).toBe(true);
      expect(e.createdAt).toBe(createdAt);
      expect(e.updatedAt).toBe(updatedAt);
      expect(e.deletedAt).toBeNull();
      expect(e.isDeleted()).toBe(false);
    });

    it('reconstitute con activo=false preserva el estado inactivo', () => {
      const e = EquipoInformaticoEntity.reconstitute(
        makeProps({ activo: false }),
        'equipo-inactivo-id',
        new Date(),
        new Date(),
        null,
      );
      expect(e.activo).toBe(false);
    });

    it('reconstitute con deletedAt seteado → isDeleted() = true', () => {
      const deletedAt = new Date('2026-06-01T00:00:00.000Z');
      const e = EquipoInformaticoEntity.reconstitute(
        makeProps(),
        'equipo-deleted-id',
        new Date('2026-01-01'),
        new Date('2026-06-01'),
        deletedAt,
      );
      expect(e.deletedAt?.getTime()).toBe(deletedAt.getTime());
      expect(e.isDeleted()).toBe(true);
    });
  });
});
