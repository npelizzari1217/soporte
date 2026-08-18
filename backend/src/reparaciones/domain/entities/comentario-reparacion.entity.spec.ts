/**
 * [ENTITY][RED→GREEN] — `ComentarioReparacionEntity`.
 *
 * Cubre solo las invariantes reales: el recorte del texto y su rechazo, y que
 * `reconstitute` respeta el contrato append-only (sin `updatedAt` propio, sin
 * `deletedAt`). Los getters triviales no se testean.
 */
import {
  COMENTARIO_TEXTO_MAX_LENGTH,
  ComentarioReparacionEntity,
} from './comentario-reparacion.entity';

const BASE = { ticketEdiliciaId: 'edilicia-uuid', autorId: 'autor-uuid' };

describe('ComentarioReparacionEntity', () => {
  describe('create()', () => {
    it.each([
      ['vacío', ''],
      ['solo espacios', '   '],
      ['solo whitespace mixto', ' \t\n '],
      ['excede el máximo', 'x'.repeat(COMENTARIO_TEXTO_MAX_LENGTH + 1)],
    ])('rechaza un texto %s', (_label, texto) => {
      expect(() => ComentarioReparacionEntity.create({ ...BASE, texto })).toThrow(Error);
    });

    it('recorta el texto antes de persistirlo', () => {
      const comentario = ComentarioReparacionEntity.create({
        ...BASE,
        texto: '  Falta el repuesto X  ',
      });

      expect(comentario.texto).toBe('Falta el repuesto X');
    });

    it('acepta exactamente el largo máximo (el borde es válido)', () => {
      const texto = 'x'.repeat(COMENTARIO_TEXTO_MAX_LENGTH);

      expect(ComentarioReparacionEntity.create({ ...BASE, texto }).texto).toHaveLength(
        COMENTARIO_TEXTO_MAX_LENGTH,
      );
    });

    it('genera un id UUIDv7 propio cuando no se provee uno', () => {
      const comentario = ComentarioReparacionEntity.create({ ...BASE, texto: 'Demorado' });

      expect(comentario.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-/i);
    });

    it.each([
      ['ticketEdiliciaId', { ticketEdiliciaId: '  ', autorId: 'autor-uuid' }],
      ['autorId', { ticketEdiliciaId: 'edilicia-uuid', autorId: '' }],
    ])('rechaza %s vacío', (_label, params) => {
      expect(() => ComentarioReparacionEntity.create({ ...params, texto: 'Demorado' })).toThrow(
        Error,
      );
    });
  });

  describe('reconstitute()', () => {
    it('restaura el estado persistido y espeja updatedAt en createdAt (append-only, sin deletedAt)', () => {
      const createdAt = new Date('2026-08-18T10:00:00.000Z');

      const comentario = ComentarioReparacionEntity.reconstitute(
        { ticketEdiliciaId: 'edilicia-uuid', texto: 'Falta el repuesto X', autorId: 'autor-uuid' },
        'comentario-uuid',
        createdAt,
      );

      expect(comentario.id).toBe('comentario-uuid');
      expect(comentario.createdAt).toEqual(createdAt);
      expect(comentario.updatedAt).toEqual(createdAt);
      expect(comentario.deletedAt).toBeNull();
      expect(comentario.isDeleted()).toBe(false);
    });
  });
});
