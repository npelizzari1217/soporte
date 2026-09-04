import { describe, expect, it } from 'vitest';
import { FamiliaInsumoMapper } from './familia-insumo.mapper';
import { FamiliaInsumoEntity } from '../../../domain/entities/familia-insumo.entity';

describe('FamiliaInsumoMapper', () => {
  it('toDomain() convierte una fila Prisma a FamiliaInsumoEntity', () => {
    const row = {
      id: 'id-1',
      codigo: 'TONER',
      nombre: 'Tóner',
      activo: true,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-02'),
      deletedAt: null,
    };

    const entity = FamiliaInsumoMapper.toDomain(row);

    expect(entity.id).toBe('id-1');
    expect(entity.codigo).toBe('TONER');
    expect(entity.activo).toBe(true);
  });

  // El soft delete tiene que sobrevivir al viaje de vuelta: si `deletedAt` se
  // pierde en el mapeo, una familia dada de baja reaparece como vigente.
  it('toDomain() preserva el deletedAt de una fila dada de baja', () => {
    const deletedAt = new Date('2026-02-01');
    const entity = FamiliaInsumoMapper.toDomain({
      id: 'id-2',
      codigo: 'VIEJA',
      nombre: 'Vieja',
      activo: false,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-02-01'),
      deletedAt,
    });

    expect(entity.deletedAt).toEqual(deletedAt);
    expect(entity.isDeleted()).toBe(true);
  });

  it('toPersistence() convierte una FamiliaInsumoEntity a shape Prisma', () => {
    const entity = FamiliaInsumoEntity.create({ codigo: 'A', nombre: 'A', activo: true }, 'id-1');

    const row = FamiliaInsumoMapper.toPersistence(entity);

    expect(row.id).toBe('id-1');
    expect(row.codigo).toBe('A');
    expect(row.deletedAt).toBeNull();
  });
});
