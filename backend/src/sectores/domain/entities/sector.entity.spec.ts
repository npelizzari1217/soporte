import { describe, expect, it } from 'vitest';
import { SectorEntity } from './sector.entity';

describe('SectorEntity (WU-04, sdd/compras-tres-etapas-y-sectores)', () => {
  describe('create()', () => {
    it('crea un sector activo con codigo/nombre', () => {
      const sector = SectorEntity.create({
        codigo: 'COMPUTACION',
        nombre: 'Computación',
        activo: true,
      });

      expect(sector.codigo).toBe('COMPUTACION');
      expect(sector.nombre).toBe('Computación');
      expect(sector.activo).toBe(true);
      expect(sector.isDeleted()).toBe(false);
    });
  });

  describe('reconstitute()', () => {
    it('reconstituye desde persistencia preservando timestamps e id', () => {
      const createdAt = new Date('2026-01-01T00:00:00Z');
      const updatedAt = new Date('2026-01-02T00:00:00Z');
      const sector = SectorEntity.reconstitute(
        { codigo: 'LIBRERIA', nombre: 'Librería', activo: false },
        'id-fijo',
        createdAt,
        updatedAt,
        null,
      );

      expect(sector.id).toBe('id-fijo');
      expect(sector.createdAt).toEqual(createdAt);
      expect(sector.updatedAt).toEqual(updatedAt);
      expect(sector.activo).toBe(false);
    });
  });

  describe('actualizar() — PATCH semántico', () => {
    it('actualiza solo los campos provistos, deja el resto intacto', () => {
      const sector = SectorEntity.create({ codigo: 'A', nombre: 'Sector A', activo: true });

      sector.actualizar({ nombre: 'Sector A renombrado' });

      expect(sector.nombre).toBe('Sector A renombrado');
      expect(sector.codigo).toBe('A'); // no tocado
    });

    it('actualiza codigo cuando se provee', () => {
      const sector = SectorEntity.create({ codigo: 'A', nombre: 'Sector A', activo: true });

      sector.actualizar({ codigo: 'B' });

      expect(sector.codigo).toBe('B');
    });
  });

  describe('desactivar() / activar()', () => {
    it('desactivar() hace soft delete y setea activo=false', () => {
      const sector = SectorEntity.create({ codigo: 'A', nombre: 'A', activo: true });

      sector.desactivar();

      expect(sector.activo).toBe(false);
      expect(sector.isDeleted()).toBe(true);
    });

    it('activar() limpia deletedAt y setea activo=true (caso hermano de desactivar)', () => {
      const sector = SectorEntity.create({ codigo: 'A', nombre: 'A', activo: true });
      sector.desactivar();

      sector.activar();

      expect(sector.activo).toBe(true);
      expect(sector.isDeleted()).toBe(false);
    });
  });
});
