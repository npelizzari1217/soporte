import { describe, expect, it, vi } from 'vitest';
import { ConsultarHistorialUnidadUseCase } from './consultar-historial-unidad.use-case';
import { EventoUnidadInsumoEntity } from '../../domain/entities/evento-unidad-insumo.entity';
import { MovimientoInsumoEntity } from '../../domain/entities/movimiento-insumo.entity';
import { UnidadInsumoEntity } from '../../domain/entities/unidad-insumo.entity';
import { UnidadNoEncontradaError } from '../../domain/errors/unidades-insumo.errors';

const ahora = new Date('2026-01-01T00:00:00Z');
const UNIDAD = UnidadInsumoEntity.reconstitute(
  {
    insumoId: 'ins-1',
    numeroSerie: 'SN-1',
    numeroSerieNormalizado: 'SN-1',
    condicion: 'NUEVO',
    estado: 'ENTREGADA',
    equipoId: null,
  },
  'u-1',
  ahora,
  ahora,
);

function armar(eventos: EventoUnidadInsumoEntity[], movimientos: MovimientoInsumoEntity[]) {
  const listarPorIds = vi.fn(async () => movimientos);
  const useCase = new ConsultarHistorialUnidadUseCase(
    {
      findById: async (id: string) => (id === 'u-1' ? UNIDAD : null),
      nombresDeEquipos: async () => new Map([['eq-1', 'PC Caja']]),
      nombresDeSectores: async () => new Map([['sec-1', 'Administración']]),
    },
    { listarPorUnidad: async () => eventos },
    { listarPorIds },
  );
  return { useCase, listarPorIds };
}

describe('ConsultarHistorialUnidadUseCase', () => {
  it('lee sector, equipo y motivo del movimiento referenciado, sin copiarlos', async () => {
    const salida = MovimientoInsumoEntity.create({
      insumoId: 'ins-1',
      tipo: 'SALIDA',
      condicion: 'NUEVO',
      cantidad: 1,
      usuarioId: 'usr-1',
      motivo: 'Reposición',
      sectorId: 'sec-1',
      unidadId: 'u-1',
    }).getValue();
    const ingreso = EventoUnidadInsumoEntity.create({
      unidadId: 'u-1',
      tipo: 'INGRESO',
      usuarioId: 'usr-1',
    });
    const entrega = EventoUnidadInsumoEntity.create({
      unidadId: 'u-1',
      tipo: 'ENTREGA',
      movimientoId: salida.id,
      usuarioId: 'usr-1',
    });
    const { useCase, listarPorIds } = armar([ingreso, entrega], [salida]);

    const r = (await useCase.execute('ins-1', 'u-1')).getValue();

    expect(listarPorIds).toHaveBeenCalledWith([salida.id]);
    expect(r.map((h) => h.evento.tipo)).toEqual(['INGRESO', 'ENTREGA']);
    expect(r[0].sectorId).toBeNull();
    expect(r[1].sectorNombre).toBe('Administración');
    expect(r[1].motivo).toBe('Reposición');
  });

  it('resuelve el equipo del propio evento y respeta su motivo', async () => {
    const instalacion = EventoUnidadInsumoEntity.create({
      unidadId: 'u-1',
      tipo: 'INSTALACION',
      equipoId: 'eq-1',
      usuarioId: 'usr-1',
      motivo: 'Cambio de placa',
    });
    const { useCase } = armar([instalacion], []);
    const [h] = (await useCase.execute('ins-1', 'u-1')).getValue();
    expect(h.equipoNombre).toBe('PC Caja');
    expect(h.motivo).toBe('Cambio de placa');
  });

  it('una unidad sin historia devuelve una lista vacía', async () => {
    const { useCase } = armar([], []);
    expect((await useCase.execute('ins-1', 'u-1')).getValue()).toEqual([]);
  });

  it('una unidad inexistente o de otro insumo es UnidadNoEncontradaError', async () => {
    const { useCase } = armar([], []);
    expect((await useCase.execute('ins-1', 'u-9')).getError()).toBeInstanceOf(
      UnidadNoEncontradaError,
    );
    expect((await useCase.execute('ins-otro', 'u-1')).getError()).toBeInstanceOf(
      UnidadNoEncontradaError,
    );
  });
});
