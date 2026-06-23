/**
 * 6.A.1 TEST — Unit tests de TipoComponenteEntity (RED → GREEN con 6.A.2)
 *
 * Cubre:
 * - Catálogo de tipos de componente hardware
 * - activo = true por defecto
 * - Getters: codigo, nombre, activo
 * - reconstitute(): preserva todos los campos
 */
import { TipoComponenteEntity, TipoComponenteProps } from './tipos-componente.entity';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('TipoComponenteEntity', () => {
  describe('create()', () => {
    it('genera un UUIDv7 como id si no se provee', () => {
      const t = TipoComponenteEntity.create({ codigo: 'CPU', nombre: 'Procesador' });
      expect(t.id).toMatch(UUID_REGEX);
    });

    it('usa el id provisto si se pasa explícitamente', () => {
      const id = 'c3c3c3c3-0000-7000-c000-000000000003';
      const t = TipoComponenteEntity.create({ codigo: 'RAM', nombre: 'Memoria RAM' }, id);
      expect(t.id).toBe(id);
    });

    it('activo es true por defecto', () => {
      const t = TipoComponenteEntity.create({ codigo: 'DISCO', nombre: 'Disco Duro' });
      expect(t.activo).toBe(true);
    });

    it('expone codigo y nombre correctamente', () => {
      const t = TipoComponenteEntity.create({ codigo: 'MONITOR', nombre: 'Monitor' });
      expect(t.codigo).toBe('MONITOR');
      expect(t.nombre).toBe('Monitor');
    });

    it('deletedAt es null al crear', () => {
      const t = TipoComponenteEntity.create({ codigo: 'GPU', nombre: 'Tarjeta Gráfica' });
      expect(t.deletedAt).toBeNull();
      expect(t.isDeleted()).toBe(false);
    });

    it('acepta activo=false cuando se provee explícitamente', () => {
      const t = TipoComponenteEntity.create({
        codigo: 'OBSOLETO',
        nombre: 'Tipo Obsoleto',
        activo: false,
      });
      expect(t.activo).toBe(false);
    });
  });

  describe('reconstitute()', () => {
    it('preserva todos los campos al reconstituir desde persistencia', () => {
      const createdAt = new Date('2026-01-01T10:00:00Z');
      const updatedAt = new Date('2026-01-02T10:00:00Z');

      const props: TipoComponenteProps = { codigo: 'TECLADO', nombre: 'Teclado', activo: true };
      const t = TipoComponenteEntity.reconstitute(
        props,
        'tipo-id-fijo',
        createdAt,
        updatedAt,
        null,
      );

      expect(t.codigo).toBe('TECLADO');
      expect(t.nombre).toBe('Teclado');
      expect(t.activo).toBe(true);
      expect(t.createdAt).toBe(createdAt);
      expect(t.updatedAt).toBe(updatedAt);
      expect(t.deletedAt).toBeNull();
      expect(t.isDeleted()).toBe(false);
    });

    it('reconstitute con deletedAt seteado → isDeleted() = true', () => {
      const deletedAt = new Date('2026-06-01T00:00:00.000Z');
      const t = TipoComponenteEntity.reconstitute(
        { codigo: 'OBSOLETO', nombre: 'Tipo Obsoleto', activo: false },
        'tipo-deleted-id',
        new Date('2026-01-01'),
        new Date('2026-06-01'),
        deletedAt,
      );
      expect(t.deletedAt?.getTime()).toBe(deletedAt.getTime());
      expect(t.isDeleted()).toBe(true);
    });
  });
});
