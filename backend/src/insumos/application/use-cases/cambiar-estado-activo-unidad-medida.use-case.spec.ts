import { describe, expect, it, vi } from 'vitest';
import { CambiarEstadoActivoUnidadMedidaUseCase } from './cambiar-estado-activo-unidad-medida.use-case';
import { UnidadMedidaEntity } from '../../domain/entities/unidad-medida.entity';
import { UnidadMedidaNoEncontradaError } from '../../domain/errors/unidades-medida.errors';

describe('CambiarEstadoActivoUnidadMedidaUseCase', () => {
  it('desactiva una unidad activa', async () => {
    const unidad = UnidadMedidaEntity.create({ codigo: 'A', nombre: 'A', activo: true }, 'id-1');
    const repo = {
      findById: vi.fn().mockResolvedValue(unidad),
      save: vi.fn().mockResolvedValue(undefined),
    };
    const useCase = new CambiarEstadoActivoUnidadMedidaUseCase(repo);

    const result = await useCase.execute({ id: 'id-1', activo: false });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().activo).toBe(false);
  });

  it('reactiva una unidad desactivada (caso hermano)', async () => {
    const unidad = UnidadMedidaEntity.create({ codigo: 'A', nombre: 'A', activo: true }, 'id-1');
    unidad.desactivar();
    const repo = {
      findById: vi.fn().mockResolvedValue(unidad),
      save: vi.fn().mockResolvedValue(undefined),
    };
    const useCase = new CambiarEstadoActivoUnidadMedidaUseCase(repo);

    const result = await useCase.execute({ id: 'id-1', activo: true });

    expect(result.isOk()).toBe(true);
    expect(result.getValue().activo).toBe(true);
  });

  it('rechaza con UnidadMedidaNoEncontradaError si el id no existe', async () => {
    const repo = { findById: vi.fn().mockResolvedValue(null), save: vi.fn() };
    const useCase = new CambiarEstadoActivoUnidadMedidaUseCase(repo);

    const result = await useCase.execute({ id: 'nope', activo: false });

    expect(result.isFail()).toBe(true);
    expect(result.getError()).toBeInstanceOf(UnidadMedidaNoEncontradaError);
  });
});
