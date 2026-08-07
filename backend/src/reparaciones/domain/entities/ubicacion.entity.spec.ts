/**
 * T6.5 [UNIT][RED→GREEN] — `UbicacionEntity`.
 *
 * create (árbol padreId); activar/desactivar; actualizar.
 *
 * Ref spec: sdd/flujos-especializados/spec F3-E2. Ref design: "Firmas TS
 * clave" (UbicacionEntity). Tarea: T6.5.
 */
import { UbicacionEntity } from './ubicacion.entity';

describe('UbicacionEntity', () => {
  describe('create()', () => {
    it('crea un nodo raíz (padreId=null) con activo=true por defecto', () => {
      const entity = UbicacionEntity.create({ nombre: 'Edificio Central' });

      expect(entity.nombre).toBe('Edificio Central');
      expect(entity.padreId).toBeNull();
      expect(entity.activo).toBe(true);
      expect(entity.descripcion).toBeNull();
    });

    it('crea un nodo hijo con padreId', () => {
      const entity = UbicacionEntity.create({
        nombre: 'Piso 3',
        padreId: 'edificio-uuid',
        descripcion: 'Tercer piso',
      });

      expect(entity.padreId).toBe('edificio-uuid');
      expect(entity.descripcion).toBe('Tercer piso');
    });
  });

  describe('reconstitute()', () => {
    it('reconstruye una entidad desde persistencia', () => {
      const createdAt = new Date('2026-01-01T00:00:00Z');
      const updatedAt = new Date('2026-01-02T00:00:00Z');

      const entity = UbicacionEntity.reconstitute(
        { nombre: 'Sala de Servidores', descripcion: null, padreId: 'piso-uuid', activo: false },
        'db-uuid',
        createdAt,
        updatedAt,
        null,
      );

      expect(entity.id).toBe('db-uuid');
      expect(entity.activo).toBe(false);
      expect(entity.deletedAt).toBeNull();
    });
  });

  describe('activar() / desactivar()', () => {
    it('desactiva la ubicación', () => {
      const entity = UbicacionEntity.create({ nombre: 'Edificio Central' });
      entity.desactivar();
      expect(entity.activo).toBe(false);
    });

    it('reactiva la ubicación', () => {
      const entity = UbicacionEntity.create({ nombre: 'Edificio Central' });
      entity.desactivar();
      entity.activar();
      expect(entity.activo).toBe(true);
    });
  });

  describe('actualizar()', () => {
    it('actualiza nombre y descripción (PATCH semántico)', () => {
      const entity = UbicacionEntity.create({ nombre: 'Edificio Central', descripcion: null });

      entity.actualizar({ nombre: 'Edificio Norte', descripcion: 'Renombrado' });

      expect(entity.nombre).toBe('Edificio Norte');
      expect(entity.descripcion).toBe('Renombrado');
    });

    it('no toca campos undefined', () => {
      const entity = UbicacionEntity.create({ nombre: 'Edificio Central', padreId: 'raiz-uuid' });

      entity.actualizar({ descripcion: 'Solo descripción' });

      expect(entity.nombre).toBe('Edificio Central');
      expect(entity.padreId).toBe('raiz-uuid');
      expect(entity.descripcion).toBe('Solo descripción');
    });

    it('permite cambiar padreId explícitamente (incluyendo a null = raíz)', () => {
      const entity = UbicacionEntity.create({ nombre: 'Piso 3', padreId: 'edificio-uuid' });

      entity.actualizar({ padreId: null });

      expect(entity.padreId).toBeNull();
    });
  });
});
