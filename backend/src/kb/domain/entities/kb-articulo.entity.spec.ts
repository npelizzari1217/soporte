/**
 * K1 [UNIT][RED→GREEN] — KbArticuloEntity: create (titulo/contenido no
 * vacíos), editar, publicar(visible:boolean), eliminar (soft delete);
 * invariantes.
 *
 * Ref spec: sdd/premium/spec K1, K2. Ref design: ADR-P6. Tarea: K1/K2.
 */
import { KbArticuloEntity } from './kb-articulo.entity';
import { TituloVacioError, ContenidoVacioError } from '../errors/kb.errors';

function baseProps() {
  return {
    titulo: 'Cómo resetear tu contraseña',
    contenido: 'Pasos para resetear la contraseña desde el portal.',
    autorId: 'autor-uuid',
    visibleParaSolicitante: false,
    activo: true,
  };
}

describe('KbArticuloEntity', () => {
  describe('create()', () => {
    it('crea una instancia con las props dadas y un id UUIDv7 generado', () => {
      const articulo = KbArticuloEntity.create(baseProps());

      expect(articulo.titulo).toBe('Cómo resetear tu contraseña');
      expect(articulo.contenido).toBe('Pasos para resetear la contraseña desde el portal.');
      expect(articulo.autorId).toBe('autor-uuid');
      expect(articulo.visibleParaSolicitante).toBe(false);
      expect(articulo.activo).toBe(true);
      expect(articulo.id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('[CRITICAL] lanza TituloVacioError si titulo es vacío/blank', () => {
      expect(() => KbArticuloEntity.create({ ...baseProps(), titulo: '' })).toThrow(
        TituloVacioError,
      );
      expect(() => KbArticuloEntity.create({ ...baseProps(), titulo: '   ' })).toThrow(
        TituloVacioError,
      );
    });

    it('[CRITICAL] lanza ContenidoVacioError si contenido es vacío/blank', () => {
      expect(() => KbArticuloEntity.create({ ...baseProps(), contenido: '' })).toThrow(
        ContenidoVacioError,
      );
      expect(() => KbArticuloEntity.create({ ...baseProps(), contenido: '   ' })).toThrow(
        ContenidoVacioError,
      );
    });
  });

  describe('reconstitute()', () => {
    it('reconstruye una entidad desde persistencia preservando id y timestamps exactos', () => {
      const createdAt = new Date('2026-01-01T00:00:00Z');
      const updatedAt = new Date('2026-02-01T00:00:00Z');

      const articulo = KbArticuloEntity.reconstitute(
        baseProps(),
        'db-uuid-kb',
        createdAt,
        updatedAt,
        null,
      );

      expect(articulo.id).toBe('db-uuid-kb');
      expect(articulo.createdAt).toEqual(createdAt);
      expect(articulo.updatedAt).toEqual(updatedAt);
      expect(articulo.deletedAt).toBeNull();
    });

    it('preserva deletedAt no-nulo (artículo soft-deleted) sin revalidar invariantes', () => {
      const deletedAt = new Date('2026-03-01T00:00:00Z');
      const articulo = KbArticuloEntity.reconstitute(
        { ...baseProps(), activo: false },
        'db-uuid-baja',
        new Date(),
        new Date(),
        deletedAt,
      );

      expect(articulo.isDeleted()).toBe(true);
      expect(articulo.deletedAt).toEqual(deletedAt);
      expect(articulo.activo).toBe(false);
    });
  });

  describe('editar()', () => {
    it('actualiza titulo/contenido provistos y actualiza updatedAt', () => {
      const articulo = KbArticuloEntity.create(baseProps());
      const updatedAtOriginal = articulo.updatedAt;

      articulo.editar({ titulo: 'Nuevo título', contenido: 'Nuevo contenido' });

      expect(articulo.titulo).toBe('Nuevo título');
      expect(articulo.contenido).toBe('Nuevo contenido');
      expect(articulo.updatedAt.getTime()).toBeGreaterThanOrEqual(updatedAtOriginal.getTime());
    });

    it('campos undefined no se tocan (PATCH semántico)', () => {
      const articulo = KbArticuloEntity.create(baseProps());

      articulo.editar({ contenido: 'Solo el contenido' });

      expect(articulo.contenido).toBe('Solo el contenido');
      expect(articulo.titulo).toBe(baseProps().titulo);
    });

    it('[CRITICAL] lanza TituloVacioError sin mutar si titulo editado es vacío', () => {
      const articulo = KbArticuloEntity.create(baseProps());

      expect(() => articulo.editar({ titulo: '   ' })).toThrow(TituloVacioError);
      expect(articulo.titulo).toBe(baseProps().titulo);
    });

    it('[CRITICAL] lanza ContenidoVacioError sin mutar si contenido editado es vacío', () => {
      const articulo = KbArticuloEntity.create(baseProps());

      expect(() => articulo.editar({ contenido: '' })).toThrow(ContenidoVacioError);
      expect(articulo.contenido).toBe(baseProps().contenido);
    });
  });

  describe('publicar()', () => {
    it('publicar(true) setea visibleParaSolicitante=true', () => {
      const articulo = KbArticuloEntity.create(baseProps());
      articulo.publicar(true);
      expect(articulo.visibleParaSolicitante).toBe(true);
    });

    it('publicar(false) despublica (visibleParaSolicitante=false)', () => {
      const articulo = KbArticuloEntity.create({ ...baseProps(), visibleParaSolicitante: true });
      articulo.publicar(false);
      expect(articulo.visibleParaSolicitante).toBe(false);
    });
  });

  describe('eliminar() (soft delete)', () => {
    it('[CRITICAL] setea deletedAt (soft delete) y activo=false', () => {
      const articulo = KbArticuloEntity.create(baseProps());

      articulo.eliminar();

      expect(articulo.isDeleted()).toBe(true);
      expect(articulo.deletedAt).not.toBeNull();
      expect(articulo.activo).toBe(false);
    });
  });
});
