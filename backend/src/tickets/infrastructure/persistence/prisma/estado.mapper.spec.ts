/**
 * T2.2 [UNIT] — RED→GREEN: EstadoMapper.toDomain (fila Prisma → EstadoEntity).
 * Tarea: T2.2
 */
import { EstadoMapper } from './estado.mapper';
import { EstadoEntity } from '../../../domain/entities/estado.entity';

function makeRow(overrides: Partial<Parameters<typeof EstadoMapper.toDomain>[0]> = {}) {
  return {
    id: 'estado-uuid-001',
    codigo: 'NUEVO',
    nombre: 'Nuevo',
    color: '#00FF00',
    orden: 10,
    activo: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-02'),
    deletedAt: null,
    ...overrides,
  };
}

describe('EstadoMapper', () => {
  describe('toDomain()', () => {
    it('convierte una fila Prisma en EstadoEntity con las props exactas', () => {
      const row = makeRow();

      const entity = EstadoMapper.toDomain(row);

      expect(entity).toBeInstanceOf(EstadoEntity);
      expect(entity.id).toBe('estado-uuid-001');
      expect(entity.codigo).toBe('NUEVO');
      expect(entity.nombre).toBe('Nuevo');
      expect(entity.color).toBe('#00FF00');
      expect(entity.orden).toBe(10);
      expect(entity.activo).toBe(true);
      expect(entity.isDeleted()).toBe(false);
    });

    it('convierte color null de la DB en color null de la entidad (no undefined)', () => {
      const row = makeRow({ color: null });

      const entity = EstadoMapper.toDomain(row);

      expect(entity.color).toBeNull();
    });

    it('preserva deletedAt no-nulo (fila soft-deleted)', () => {
      const deletedAt = new Date('2026-05-01');
      const row = makeRow({ deletedAt });

      const entity = EstadoMapper.toDomain(row);

      expect(entity.isDeleted()).toBe(true);
      expect(entity.deletedAt).toEqual(deletedAt);
    });
  });
});
