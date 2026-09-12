import { describe, expect, it } from 'vitest';
import { ModeloEquipoMapper } from './modelo-equipo.mapper';
import { ModeloEquipoEntity } from '../../../domain/entities/modelo-equipo.entity';

describe('ModeloEquipoMapper', () => {
  it('toDomain() convierte una fila Prisma a ModeloEquipoEntity', () => {
    const row = {
      id: 'id-1',
      marca: 'HP',
      modelo: 'LaserJet Pro M404',
      activo: true,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-02'),
      deletedAt: null,
    };

    const entity = ModeloEquipoMapper.toDomain(row);

    expect(entity.id).toBe('id-1');
    expect(entity.marca).toBe('HP');
    expect(entity.modelo).toBe('LaserJet Pro M404');
    expect(entity.activo).toBe(true);
  });

  // El soft delete tiene que sobrevivir al viaje de vuelta: si `deletedAt` se
  // pierde en el mapeo, un modelo dado de baja reaparece como vigente.
  it('toDomain() preserva el deletedAt de una fila dada de baja', () => {
    const deletedAt = new Date('2026-02-01');
    const entity = ModeloEquipoMapper.toDomain({
      id: 'id-2',
      marca: 'VIEJA',
      modelo: 'Vieja',
      activo: false,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-02-01'),
      deletedAt,
    });

    expect(entity.deletedAt).toEqual(deletedAt);
    expect(entity.isDeleted()).toBe(true);
  });

  it('toPersistence() convierte un ModeloEquipoEntity a shape Prisma', () => {
    const entity = ModeloEquipoEntity.create({ marca: 'HP', modelo: 'M404', activo: true }, 'id-1');

    const row = ModeloEquipoMapper.toPersistence(entity);

    expect(row.id).toBe('id-1');
    expect(row.marca).toBe('HP');
    expect(row.modelo).toBe('M404');
    expect(row.deletedAt).toBeNull();
  });

  /**
   * Issue #172 — gemelo de `movimiento-insumo.mapper.spec.ts` ("NO incluye
   * createdAt..."). La entidad guarda el reloj del PROCESO (`BaseEntity`,
   * `new Date()`); si viajara en el INSERT, el `DEFAULT clock_timestamp()`
   * de la columna (`prisma_tenant/schema.prisma`, `ModeloEquipo.createdAt`)
   * no se dispararía nunca. `save()` manda este mismo shape también en el
   * UPDATE, así que omitirlo alcanza para las dos ramas del `upsert`.
   */
  it('toPersistence() NO incluye createdAt: la fecha la tiene que poner el DEFAULT de la columna, no el proceso', () => {
    const entity = ModeloEquipoEntity.create({ marca: 'HP', modelo: 'M404', activo: true }, 'id-1');

    const row = ModeloEquipoMapper.toPersistence(entity);

    expect(row).not.toHaveProperty('createdAt');
  });
});
