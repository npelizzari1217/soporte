import { describe, it, expect } from 'vitest';
import type { ComponenteEquipo as PrismaComponenteEquipo } from '.prisma/tenant';
import { ComponenteEquipoMapper } from './componente-equipo.mapper';
import { ComponenteEquipoEntity } from '../../../domain/entities/componente-equipo.entity';

/** Fila base sin registro de retiro: un componente activo. */
function fila(override: Partial<PrismaComponenteEquipo> = {}): PrismaComponenteEquipo {
  return {
    id: 'comp-1',
    equipoId: 'equipo-1',
    insumoId: 'insumo-1',
    descripcion: 'Kingston 16GB',
    numeroSerie: null,
    capacidad: '16GB',
    createdAt: new Date('2026-09-01T10:00:00Z'),
    updatedAt: new Date('2026-09-02T10:00:00Z'),
    deletedAt: null,
    instalacionMovimientoId: null,
    bajaDestino: null,
    bajaMotivo: null,
    bajaMovimientoId: null,
    bajaUsuarioId: null,
    ...override,
  };
}

describe('ComponenteEquipoMapper — registro de retiro (sdd/stock-usado-componentes)', () => {
  it('toDomain(): un componente activo trae el registro de retiro vacío', () => {
    const entity = ComponenteEquipoMapper.toDomain(fila());
    expect(entity.activo).toBe(true);
    expect(entity.instalacionMovimientoId).toBeNull();
    expect(entity.bajaDestino).toBeNull();
    expect(entity.bajaSinSalidaPrevia).toBe(false);
  });

  it('toDomain(): un retiro LEGADO (deleted_at sin destino) queda con todo en null', () => {
    const entity = ComponenteEquipoMapper.toDomain(fila({ deletedAt: new Date('2026-09-10') }));
    expect(entity.activo).toBe(false);
    expect(entity.bajaDestino).toBeNull();
    expect(entity.bajaMotivo).toBeNull();
    expect(entity.bajaMovimientoId).toBeNull();
    expect(entity.bajaUsuarioId).toBeNull();
  });

  it('toDomain(): lee las cinco columnas nuevas de un STOCK_USADO sin SALIDA vinculada', () => {
    const entity = ComponenteEquipoMapper.toDomain(
      fila({
        deletedAt: new Date('2026-09-10'),
        bajaDestino: 'STOCK_USADO',
        bajaMotivo: 'Pieza sana',
        bajaMovimientoId: 'mov-entrada',
        bajaUsuarioId: 'user-1',
      }),
    );
    expect(entity.bajaDestino).toBe('STOCK_USADO');
    expect(entity.bajaMotivo).toBe('Pieza sana');
    expect(entity.bajaMovimientoId).toBe('mov-entrada');
    expect(entity.bajaUsuarioId).toBe('user-1');
    expect(entity.bajaSinSalidaPrevia).toBe(true);
  });

  it('toDomain(): con instalacion_movimiento_id la marca derivada es false', () => {
    const entity = ComponenteEquipoMapper.toDomain(
      fila({
        instalacionMovimientoId: 'mov-salida',
        deletedAt: new Date('2026-09-10'),
        bajaDestino: 'STOCK_USADO',
        bajaMovimientoId: 'mov-entrada',
        bajaUsuarioId: 'user-1',
      }),
    );
    expect(entity.instalacionMovimientoId).toBe('mov-salida');
    expect(entity.bajaSinSalidaPrevia).toBe(false);
  });

  it('toPersistence(): escribe las columnas de un DESCARTE y NO incluye una marca guardada', () => {
    const entity = ComponenteEquipoEntity.create(
      {
        equipoId: 'equipo-1',
        insumoId: 'insumo-1',
        descripcion: null,
        numeroSerie: null,
        capacidad: null,
        instalacionMovimientoId: 'mov-salida',
      },
      'comp-1',
    ).getValue();
    entity.retirar({
      destino: 'DESCARTE',
      motivo: 'Placa quemada',
      usuarioId: 'user-1',
      bajaMovimientoId: null,
    });

    const data = ComponenteEquipoMapper.toPersistence(entity);

    expect(data).toMatchObject({
      instalacionMovimientoId: 'mov-salida',
      bajaDestino: 'DESCARTE',
      bajaMotivo: 'Placa quemada',
      bajaMovimientoId: null,
      bajaUsuarioId: 'user-1',
    });
    expect(data.deletedAt).not.toBeNull();
    expect(data).not.toHaveProperty('bajaSinSalidaPrevia');
  });

  it('toPersistence(): un componente activo escribe las cuatro columnas de retiro en null', () => {
    const data = ComponenteEquipoMapper.toPersistence(ComponenteEquipoMapper.toDomain(fila()));
    expect(data).toMatchObject({
      instalacionMovimientoId: null,
      bajaDestino: null,
      bajaMotivo: null,
      bajaMovimientoId: null,
      bajaUsuarioId: null,
      deletedAt: null,
    });
  });
});
