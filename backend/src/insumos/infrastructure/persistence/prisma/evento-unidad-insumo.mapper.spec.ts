import { describe, expect, it } from 'vitest';
import { EventoUnidadInsumoMapper } from './evento-unidad-insumo.mapper';
import { EventoUnidadInsumoEntity } from '../../../domain/entities/evento-unidad-insumo.entity';

/** Fila base de `eventos_unidad_insumo`, para que cada caso sobrescriba solo lo suyo. */
function filaEvento(
  overrides: Partial<Parameters<typeof EventoUnidadInsumoMapper.toDomain>[0]> = {},
): Parameters<typeof EventoUnidadInsumoMapper.toDomain>[0] {
  return {
    id: 'evento-1',
    unidadId: 'unidad-1',
    tipo: 'CORRECCION_SERIAL',
    movimientoId: null,
    equipoId: null,
    componenteId: null,
    serialAnterior: 'SN001',
    serialNuevo: 'SN002',
    motivo: 'Typo al cargar',
    usuarioId: 'usuario-1',
    createdAt: new Date('2026-09-30T10:00:00.000Z'),
    ...overrides,
  };
}

describe('EventoUnidadInsumoMapper', () => {
  it('toDomain() convierte la fila y preserva id y fecha de alta', () => {
    const entity = EventoUnidadInsumoMapper.toDomain(filaEvento());

    expect(entity.id).toBe('evento-1');
    expect(entity.unidadId).toBe('unidad-1');
    expect(entity.tipo).toBe('CORRECCION_SERIAL');
    expect(entity.serialAnterior).toBe('SN001');
    expect(entity.serialNuevo).toBe('SN002');
    expect(entity.motivo).toBe('Typo al cargar');
    expect(entity.usuarioId).toBe('usuario-1');
    expect(entity.createdAt).toEqual(new Date('2026-09-30T10:00:00.000Z'));
    expect(entity.updatedAt).toEqual(entity.createdAt);
  });

  it('toDomain() lee movimiento, equipo y componente', () => {
    const entity = EventoUnidadInsumoMapper.toDomain(
      filaEvento({
        tipo: 'INSTALACION',
        movimientoId: 'mov-1',
        equipoId: 'equipo-1',
        componenteId: 'comp-1',
        serialAnterior: null,
        serialNuevo: null,
        motivo: null,
      }),
    );

    expect(entity.movimientoId).toBe('mov-1');
    expect(entity.equipoId).toBe('equipo-1');
    expect(entity.componenteId).toBe('comp-1');
  });

  it('toPersistence() emite el id de la entidad y los nulos explícitos, sin createdAt', () => {
    const evento = EventoUnidadInsumoEntity.create(
      { unidadId: 'unidad-1', tipo: 'INGRESO', usuarioId: 'usuario-1', movimientoId: 'mov-1' },
      'evento-2',
    );

    const fila = EventoUnidadInsumoMapper.toPersistence(evento);

    expect(fila).toEqual({
      id: 'evento-2',
      unidadId: 'unidad-1',
      tipo: 'INGRESO',
      movimientoId: 'mov-1',
      equipoId: null,
      componenteId: null,
      serialAnterior: null,
      serialNuevo: null,
      motivo: null,
      usuarioId: 'usuario-1',
    });
    expect(fila).not.toHaveProperty('createdAt');
  });
});
