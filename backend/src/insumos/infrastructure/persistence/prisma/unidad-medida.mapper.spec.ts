import { describe, expect, it } from 'vitest';
import { UnidadMedidaMapper } from './unidad-medida.mapper';
import { UnidadMedidaEntity } from '../../../domain/entities/unidad-medida.entity';

describe('UnidadMedidaMapper', () => {
  it('toDomain() convierte una fila Prisma a UnidadMedidaEntity', () => {
    const row = {
      id: 'id-1',
      codigo: 'UN',
      nombre: 'Unidad',
      activo: true,
      entera: false,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-02'),
      deletedAt: null,
    };

    const entity = UnidadMedidaMapper.toDomain(row);

    expect(entity.id).toBe('id-1');
    expect(entity.codigo).toBe('UN');
    expect(entity.activo).toBe(true);
  });

  // El soft delete tiene que sobrevivir al viaje de vuelta: si `deletedAt` se
  // pierde en el mapeo, una unidad dada de baja reaparece como vigente.
  it('toDomain() preserva el deletedAt de una fila dada de baja', () => {
    const deletedAt = new Date('2026-02-01');
    const entity = UnidadMedidaMapper.toDomain({
      id: 'id-2',
      codigo: 'VIEJA',
      nombre: 'Vieja',
      activo: false,
      entera: false,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-02-01'),
      deletedAt,
    });

    expect(entity.deletedAt).toEqual(deletedAt);
    expect(entity.isDeleted()).toBe(true);
  });

  it('toPersistence() convierte una UnidadMedidaEntity a shape Prisma', () => {
    const entity = UnidadMedidaEntity.create({ codigo: 'A', nombre: 'A', activo: true }, 'id-1');

    const row = UnidadMedidaMapper.toPersistence(entity);

    expect(row.id).toBe('id-1');
    expect(row.codigo).toBe('A');
    expect(row.deletedAt).toBeNull();
  });

  /**
   * Issue #172 — gemelo de `movimiento-insumo.mapper.spec.ts` ("NO incluye
   * createdAt..."). La entidad guarda el reloj del PROCESO (`BaseEntity`,
   * `new Date()`); si viajara en el INSERT, el `DEFAULT clock_timestamp()`
   * de la columna (`prisma_tenant/schema.prisma`, `UnidadMedida.createdAt`)
   * no se dispararía nunca. `save()` manda este mismo shape también en el
   * UPDATE, así que omitirlo alcanza para las dos ramas del `upsert`.
   */
  it('toPersistence() NO incluye createdAt: la fecha la tiene que poner el DEFAULT de la columna, no el proceso', () => {
    const entity = UnidadMedidaEntity.create({ codigo: 'A', nombre: 'A', activo: true }, 'id-1');

    const row = UnidadMedidaMapper.toPersistence(entity);

    expect(row).not.toHaveProperty('createdAt');
  });

  it('toDomain() lee entera de la fila', () => {
    const fila = {
      id: 'id-3',
      codigo: 'UNI',
      nombre: 'Unidad',
      activo: true,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-02'),
      deletedAt: null,
    };

    expect(UnidadMedidaMapper.toDomain({ ...fila, entera: true }).entera).toBe(true);
    expect(UnidadMedidaMapper.toDomain({ ...fila, entera: false }).entera).toBe(false);
  });

  it('toPersistence() manda entera, en true y en false', () => {
    const entera = UnidadMedidaEntity.create(
      { codigo: 'UNI', nombre: 'Unidad', activo: true, entera: true },
      'id-1',
    );
    const noEntera = UnidadMedidaEntity.create(
      { codigo: 'CM', nombre: 'Centímetro', activo: true },
      'id-2',
    );

    expect(UnidadMedidaMapper.toPersistence(entera).entera).toBe(true);
    expect(UnidadMedidaMapper.toPersistence(noEntera).entera).toBe(false);
  });
});
