import { describe, expect, it, vi } from 'vitest';
import { ListarUnidadesInsumoUseCase } from './listar-unidades-insumo.use-case';
import { InsumoEntity } from '../../domain/entities/insumo.entity';
import { EstadoUnidadInsumo, UnidadInsumoEntity } from '../../domain/entities/unidad-insumo.entity';
import { InsumoNoEncontradoError } from '../../domain/errors/insumos.errors';

function unidad(
  id: string,
  estado: EstadoUnidadInsumo,
  numeroSerie: string | null,
  equipoId: string | null = null,
): UnidadInsumoEntity {
  const ahora = new Date('2026-01-01T00:00:00Z');
  return UnidadInsumoEntity.reconstitute(
    {
      insumoId: 'ins-1',
      numeroSerie,
      numeroSerieNormalizado: numeroSerie,
      condicion: 'NUEVO',
      estado,
      equipoId,
    },
    id,
    ahora,
    ahora,
  );
}

function armar(unidades: UnidadInsumoEntity[], existe = true) {
  const insumo = InsumoEntity.create(
    {
      codigo: 'X-1',
      nombre: 'Placa',
      familiaId: 'fam-1',
      unidadMedidaId: 'uni-1',
      stockMinimo: null,
      activo: true,
      codigosAlternativos: [],
      compatibilidad: [],
    },
    'ins-1',
  );
  const listarPorInsumo = vi.fn(async (_id: string, estados?: readonly EstadoUnidadInsumo[]) =>
    unidades.filter((u) => estados === undefined || estados.includes(u.estado)),
  );
  const nombresDeEquipos = vi.fn(async () => new Map([['eq-1', 'PC Caja']]));
  const useCase = new ListarUnidadesInsumoUseCase(
    { findById: async () => (existe ? insumo : null) },
    { listarPorInsumo, nombresDeEquipos },
  );
  return { useCase, listarPorInsumo };
}

describe('ListarUnidadesInsumoUseCase', () => {
  const todas = [
    unidad('u-1', 'EN_DEPOSITO', 'SN-1'),
    unidad('u-2', 'EN_DEPOSITO', null),
    unidad('u-3', 'INSTALADA', 'SN-3', 'eq-1'),
  ];

  it('sin filtros devuelve todas, con el nombre del equipo de la instalada', async () => {
    const { useCase } = armar(todas);
    const r = (await useCase.execute({ insumoId: 'ins-1' })).getValue();
    expect(r.map((i) => i.unidad.id)).toEqual(['u-1', 'u-2', 'u-3']);
    expect(r[2].equipoNombre).toBe('PC Caja');
    expect(r[0].equipoNombre).toBeNull();
  });

  it('estado filtra en el repositorio', async () => {
    const { useCase, listarPorInsumo } = armar(todas);
    const r = (await useCase.execute({ insumoId: 'ins-1', estado: 'EN_DEPOSITO' })).getValue();
    expect(listarPorInsumo).toHaveBeenCalledWith('ins-1', ['EN_DEPOSITO']);
    expect(r.map((i) => i.unidad.id)).toEqual(['u-1', 'u-2']);
  });

  it('disponibles=true deja solo EN_DEPOSITO con serial (sin pendientes)', async () => {
    const { useCase } = armar(todas);
    const r = (await useCase.execute({ insumoId: 'ins-1', disponibles: true })).getValue();
    expect(r.map((i) => i.unidad.id)).toEqual(['u-1']);
  });

  it('un insumo inexistente devuelve InsumoNoEncontradoError', async () => {
    const { useCase } = armar([], false);
    const r = await useCase.execute({ insumoId: 'ins-1' });
    expect(r.getError()).toBeInstanceOf(InsumoNoEncontradoError);
  });
});
