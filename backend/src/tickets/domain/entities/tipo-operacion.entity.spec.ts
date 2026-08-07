/**
 * T2.1 [UNIT] — RED→GREEN: TipoOperacionEntity (catálogo FIJO, 5 códigos —
 * eventos del timeline: CAMBIO_ESTADO, COMENTARIO, ASIGNACION, ADJUNTO,
 * AVANCE_EDILICIO).
 *
 * Sin columnas color/orden en el schema real — props mínimas: codigo,
 * nombre, activo (idéntica forma a TipoTicketEntity).
 *
 * Ref spec: sdd/tickets-core/spec (Área A — Catálogos). Tarea: T2.1
 */
import { TipoOperacionEntity } from './tipo-operacion.entity';

function baseProps() {
  return { codigo: 'CAMBIO_ESTADO', nombre: 'Cambio de estado', activo: true };
}

describe('TipoOperacionEntity', () => {
  describe('create()', () => {
    it('crea una instancia con las props dadas y un id UUIDv7 generado', () => {
      const tipoOp = TipoOperacionEntity.create(baseProps());

      expect(tipoOp.codigo).toBe('CAMBIO_ESTADO');
      expect(tipoOp.nombre).toBe('Cambio de estado');
      expect(tipoOp.activo).toBe(true);
      expect(tipoOp.id).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  describe('reconstitute()', () => {
    it('reconstruye una entidad desde persistencia preservando id y timestamps exactos', () => {
      const createdAt = new Date('2026-01-01T00:00:00Z');
      const updatedAt = new Date('2026-02-01T00:00:00Z');

      const tipoOp = TipoOperacionEntity.reconstitute(
        { codigo: 'ADJUNTO', nombre: 'Adjunto', activo: true },
        'db-uuid-adjunto',
        createdAt,
        updatedAt,
        null,
      );

      expect(tipoOp.id).toBe('db-uuid-adjunto');
      expect(tipoOp.codigo).toBe('ADJUNTO');
      expect(tipoOp.createdAt).toEqual(createdAt);
      expect(tipoOp.updatedAt).toEqual(updatedAt);
      expect(tipoOp.deletedAt).toBeNull();
    });

    it('preserva deletedAt no-nulo', () => {
      const deletedAt = new Date('2026-03-01T00:00:00Z');
      const tipoOp = TipoOperacionEntity.reconstitute(
        baseProps(),
        'db-uuid-baja',
        new Date(),
        new Date(),
        deletedAt,
      );

      expect(tipoOp.isDeleted()).toBe(true);
      expect(tipoOp.deletedAt).toEqual(deletedAt);
    });
  });
});
