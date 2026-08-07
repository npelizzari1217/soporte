/**
 * T2.2 [UNIT] — RED→GREEN: TipoOperacionMapper.toDomain (fila Prisma → TipoOperacionEntity).
 * Tarea: T2.2
 */
import { TipoOperacionMapper } from './tipo-operacion.mapper';
import { TipoOperacionEntity } from '../../../domain/entities/tipo-operacion.entity';

function makeRow(overrides: Partial<Parameters<typeof TipoOperacionMapper.toDomain>[0]> = {}) {
  return {
    id: 'tipo-operacion-uuid-001',
    codigo: 'COMENTARIO',
    nombre: 'Comentario',
    activo: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-02'),
    deletedAt: null,
    ...overrides,
  };
}

describe('TipoOperacionMapper', () => {
  describe('toDomain()', () => {
    it('convierte una fila Prisma en TipoOperacionEntity con las props exactas', () => {
      const row = makeRow();

      const entity = TipoOperacionMapper.toDomain(row);

      expect(entity).toBeInstanceOf(TipoOperacionEntity);
      expect(entity.id).toBe('tipo-operacion-uuid-001');
      expect(entity.codigo).toBe('COMENTARIO');
      expect(entity.activo).toBe(true);
    });

    it('preserva deletedAt no-nulo', () => {
      const deletedAt = new Date('2026-05-01');
      const row = makeRow({ deletedAt });

      const entity = TipoOperacionMapper.toDomain(row);

      expect(entity.isDeleted()).toBe(true);
    });
  });
});
