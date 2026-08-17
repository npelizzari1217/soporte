import { describe, expect, it } from 'vitest';
import { SectorMapper } from './sector.mapper';
import { SectorEntity } from '../../../domain/entities/sector.entity';

describe('SectorMapper (WU-05)', () => {
  it('toDomain() convierte una fila Prisma a SectorEntity', () => {
    const row = {
      id: 'id-1',
      codigo: 'COMPUTACION',
      nombre: 'Computación',
      activo: true,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-02'),
      deletedAt: null,
    };

    const entity = SectorMapper.toDomain(row);

    expect(entity.id).toBe('id-1');
    expect(entity.codigo).toBe('COMPUTACION');
    expect(entity.activo).toBe(true);
  });

  it('toPersistence() convierte una SectorEntity a shape Prisma', () => {
    const entity = SectorEntity.create({ codigo: 'A', nombre: 'A', activo: true }, 'id-1');

    const row = SectorMapper.toPersistence(entity);

    expect(row.id).toBe('id-1');
    expect(row.codigo).toBe('A');
    expect(row.deletedAt).toBeNull();
  });
});
