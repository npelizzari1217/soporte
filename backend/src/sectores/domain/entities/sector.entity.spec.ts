import { describe, expect, it } from 'vitest';
import { SectorEntity, SECTOR_CODIGO_MAX_LENGTH, SECTOR_NOMBRE_MAX_LENGTH } from './sector.entity';

/**
 * El dominio es la AUTORIDAD del largo; el VarChar de Postgres es backstop.
 * La precondición va como throw y no como Result porque un primitivo fuera de
 * rango llegando a la entidad es violación de contrato del caller, no una
 * desviación de negocio que el usuario deba ver.
 *
 * Se recorren create() Y actualizar(): el guard está invocado en los dos, y
 * sin el par, borrar uno solo no pone nada en rojo — que es exactamente el
 * agujero que la revisión de este cambio midió en los DTOs.
 */
describe.each([
  [
    'create()',
    (codigo: string, nombre: string) => (): unknown =>
      SectorEntity.create({ codigo, nombre, activo: true }),
  ],
  [
    'actualizar()',
    (codigo: string, nombre: string) => (): unknown =>
      SectorEntity.create({ codigo: 'A', nombre: 'A', activo: true }).actualizar({
        codigo,
        nombre,
      }),
  ],
])('SectorEntity %s — precondición de largo', (_caso, construir) => {
  it('lanza si codigo excede el tope de la columna', () => {
    expect(construir('A'.repeat(SECTOR_CODIGO_MAX_LENGTH + 1), 'N')).toThrow(/codigo excede/);
  });

  it('acepta codigo en el tope exacto (límite inclusive)', () => {
    expect(construir('A'.repeat(SECTOR_CODIGO_MAX_LENGTH), 'N')).not.toThrow();
  });

  it('lanza si nombre excede el tope de la columna', () => {
    expect(construir('A', 'N'.repeat(SECTOR_NOMBRE_MAX_LENGTH + 1))).toThrow(/nombre excede/);
  });

  it('acepta nombre en el tope exacto (límite inclusive)', () => {
    expect(construir('A', 'N'.repeat(SECTOR_NOMBRE_MAX_LENGTH))).not.toThrow();
  });
});

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
