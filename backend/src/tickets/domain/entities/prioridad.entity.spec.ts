/**
 * T2.1 [UNIT] — RED→GREEN: PrioridadEntity (catálogo FIJO, 4 códigos).
 * Clon adaptado de soporte1/backend/src/tickets/domain/entities/prioridad.entity.ts.
 *
 * Ref spec: sdd/tickets-core/spec (Área A — Catálogos). Tarea: T2.1
 */
import { PrioridadEntity } from './prioridad.entity';

function baseProps() {
  return { codigo: 'MEDIA', nombre: 'Media', color: '#FFA500', orden: 20, activo: true };
}

describe('PrioridadEntity', () => {
  describe('create()', () => {
    it('crea una instancia con las props dadas y un id UUIDv7 generado', () => {
      const prioridad = PrioridadEntity.create(baseProps());

      expect(prioridad.codigo).toBe('MEDIA');
      expect(prioridad.nombre).toBe('Media');
      expect(prioridad.color).toBe('#FFA500');
      expect(prioridad.orden).toBe(20);
      expect(prioridad.activo).toBe(true);
      expect(prioridad.id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('acepta color null', () => {
      const prioridad = PrioridadEntity.create({ ...baseProps(), color: null });
      expect(prioridad.color).toBeNull();
    });

    it('slaHoras/slaActivo default a null/true cuando no se proveen (sin SLA configurado aún)', () => {
      const prioridad = PrioridadEntity.create(baseProps());
      expect(prioridad.slaHoras).toBeNull();
      expect(prioridad.slaActivo).toBe(true);
    });

    it('acepta slaHoras/slaActivo explícitos', () => {
      const prioridad = PrioridadEntity.create({ ...baseProps(), slaHoras: 8, slaActivo: false });
      expect(prioridad.slaHoras).toBe(8);
      expect(prioridad.slaActivo).toBe(false);
    });
  });

  describe('reconstitute()', () => {
    it('reconstruye una entidad desde persistencia preservando id y timestamps exactos', () => {
      const createdAt = new Date('2026-01-01T00:00:00Z');
      const updatedAt = new Date('2026-02-01T00:00:00Z');

      const prioridad = PrioridadEntity.reconstitute(
        { codigo: 'CRITICA', nombre: 'Crítica', color: '#FF0000', orden: 40, activo: true },
        'db-uuid-critica',
        createdAt,
        updatedAt,
        null,
      );

      expect(prioridad.id).toBe('db-uuid-critica');
      expect(prioridad.codigo).toBe('CRITICA');
      expect(prioridad.createdAt).toEqual(createdAt);
      expect(prioridad.updatedAt).toEqual(updatedAt);
      expect(prioridad.deletedAt).toBeNull();
    });

    it('preserva deletedAt no-nulo (prioridad soft-deleted)', () => {
      const deletedAt = new Date('2026-03-01T00:00:00Z');
      const prioridad = PrioridadEntity.reconstitute(
        baseProps(),
        'db-uuid-baja',
        new Date(),
        new Date(),
        deletedAt,
      );

      expect(prioridad.isDeleted()).toBe(true);
      expect(prioridad.deletedAt).toEqual(deletedAt);
    });
  });

  // ─── T11.2 — CRUD editable (PR11) ────────────────────────────────────────

  describe('actualizar()', () => {
    it('actualiza los campos provistos y actualiza updatedAt', () => {
      const prioridad = PrioridadEntity.create(baseProps());
      const updatedAtOriginal = prioridad.updatedAt;

      prioridad.actualizar({ nombre: 'Media alta', color: '#FFCC00', orden: 25 });

      expect(prioridad.nombre).toBe('Media alta');
      expect(prioridad.color).toBe('#FFCC00');
      expect(prioridad.orden).toBe(25);
      expect(prioridad.updatedAt.getTime()).toBeGreaterThanOrEqual(updatedAtOriginal.getTime());
    });

    it('campos undefined no se tocan (PATCH semántico); color:null limpia explícitamente', () => {
      const prioridad = PrioridadEntity.create(baseProps());

      prioridad.actualizar({ color: null });

      expect(prioridad.color).toBeNull();
      expect(prioridad.nombre).toBe('Media');
      expect(prioridad.codigo).toBe('MEDIA');
    });

    it.each([
      ['setea slaHoras/slaActivo cuando se proveen', { slaHoras: 12, slaActivo: false }, 12, false],
      ['slaHoras:null limpia el SLA explícitamente', { slaHoras: null }, null, true],
    ])('%s', (_label, datos, slaHorasEsperado, slaActivoEsperado) => {
      const prioridad = PrioridadEntity.create({ ...baseProps(), slaHoras: 8, slaActivo: true });

      prioridad.actualizar(datos);

      expect(prioridad.slaHoras).toBe(slaHorasEsperado);
      expect(prioridad.slaActivo).toBe(slaActivoEsperado);
    });

    it('slaHoras/slaActivo undefined no se tocan (PATCH semántico)', () => {
      const prioridad = PrioridadEntity.create({ ...baseProps(), slaHoras: 8, slaActivo: true });

      prioridad.actualizar({ nombre: 'Media alta' });

      expect(prioridad.slaHoras).toBe(8);
      expect(prioridad.slaActivo).toBe(true);
    });
  });

  describe('desactivar()/activar()', () => {
    it('desactivar() setea deletedAt (soft delete) y activo=false, sin romper tickets existentes (T2)', () => {
      const prioridad = PrioridadEntity.create(baseProps());

      prioridad.desactivar();

      expect(prioridad.isDeleted()).toBe(true);
      expect(prioridad.deletedAt).not.toBeNull();
      expect(prioridad.activo).toBe(false);
    });

    it('activar() limpia deletedAt y setea activo=true', () => {
      const prioridad = PrioridadEntity.create(baseProps());
      prioridad.desactivar();

      prioridad.activar();

      expect(prioridad.isDeleted()).toBe(false);
      expect(prioridad.deletedAt).toBeNull();
      expect(prioridad.activo).toBe(true);
    });
  });
});
