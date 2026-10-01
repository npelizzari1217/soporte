import { describe, expect, it } from 'vitest';
import { UnidadInsumoMapper } from './unidad-insumo.mapper';
import { UnidadInsumoEntity } from '../../../domain/entities/unidad-insumo.entity';

/** Fila base de `unidades_insumo`, para que cada caso sobrescriba solo lo suyo. */
function filaUnidad(
  overrides: Partial<Parameters<typeof UnidadInsumoMapper.toDomain>[0]> = {},
): Parameters<typeof UnidadInsumoMapper.toDomain>[0] {
  return {
    id: 'unidad-1',
    insumoId: 'insumo-1',
    numeroSerie: 'sn 001',
    numeroSerieNormalizado: 'SN001',
    condicion: 'NUEVO',
    estado: 'EN_DEPOSITO',
    equipoId: null,
    createdAt: new Date('2026-09-30T10:00:00.000Z'),
    updatedAt: new Date('2026-09-30T11:00:00.000Z'),
    ...overrides,
  };
}

describe('UnidadInsumoMapper', () => {
  it('toDomain() convierte la fila y preserva id y timestamps', () => {
    const entity = UnidadInsumoMapper.toDomain(filaUnidad());

    expect(entity.id).toBe('unidad-1');
    expect(entity.insumoId).toBe('insumo-1');
    expect(entity.numeroSerie).toBe('sn 001');
    expect(entity.numeroSerieNormalizado).toBe('SN001');
    expect(entity.condicion).toBe('NUEVO');
    expect(entity.estado).toBe('EN_DEPOSITO');
    expect(entity.equipoId).toBeNull();
    expect(entity.createdAt).toEqual(new Date('2026-09-30T10:00:00.000Z'));
    expect(entity.updatedAt).toEqual(new Date('2026-09-30T11:00:00.000Z'));
  });

  it('toDomain() lee una serie pendiente (serial nulo) y una instalada con su equipo', () => {
    const pendiente = UnidadInsumoMapper.toDomain(
      filaUnidad({ numeroSerie: null, numeroSerieNormalizado: null }),
    );
    const instalada = UnidadInsumoMapper.toDomain(
      filaUnidad({ estado: 'INSTALADA', equipoId: 'equipo-1' }),
    );

    expect(pendiente.esPendiente).toBe(true);
    expect(instalada.estado).toBe('INSTALADA');
    expect(instalada.equipoId).toBe('equipo-1');
  });

  it('toPersistence() emite todas las columnas con los nulos explícitos', () => {
    const pendiente = UnidadInsumoEntity.crearEnDeposito(
      { insumoId: 'insumo-1', condicion: 'USADO', numeroSerie: null },
      'unidad-2',
    ).getValue();

    expect(UnidadInsumoMapper.toPersistence(pendiente)).toEqual({
      id: 'unidad-2',
      insumoId: 'insumo-1',
      numeroSerie: null,
      numeroSerieNormalizado: null,
      condicion: 'USADO',
      estado: 'EN_DEPOSITO',
      equipoId: null,
    });
  });

  it('toPersistence() limpia equipoId al salir de INSTALADA (null explícito, no ausente)', () => {
    const unidad = UnidadInsumoMapper.toDomain(
      filaUnidad({ estado: 'INSTALADA', equipoId: 'equipo-1' }),
    );
    unidad.devolverAlDeposito();

    const fila = UnidadInsumoMapper.toPersistence(unidad);

    expect(fila).toHaveProperty('equipoId', null);
    expect(fila.estado).toBe('EN_DEPOSITO');
    expect(fila.condicion).toBe('USADO');
  });

  it('toPersistence() NO incluye createdAt ni updatedAt: los ponen la base y el ORM', () => {
    const fila = UnidadInsumoMapper.toPersistence(UnidadInsumoMapper.toDomain(filaUnidad()));

    expect(fila).not.toHaveProperty('createdAt');
    expect(fila).not.toHaveProperty('updatedAt');
  });
});
